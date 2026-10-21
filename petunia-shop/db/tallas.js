/* Tallas: collares y pañoletas se ofrecen en Pequeña y Grande; el resto queda en "Talla única".
   - Es idempotente (puedes ejecutarlo las veces que quieras) y no borra pedidos ni productos.
   - Uso independiente:  node db/tallas.js
   - Lo llaman también db/seed.js y, si lo agregas, server.js al arrancar. */
const db = require('./index');

const TIPOS_CON_TALLAS = ['collares', 'panoletas'];
const TALLAS = ['Pequeña', 'Grande'];

function applySizes() {
  return db.transaction(() => {
    const getOrCreate = (label, position) =>
      db.prepare('SELECT id FROM sizes WHERE label = ?').get(label)?.id
      ?? db.prepare('INSERT INTO sizes (label, position) VALUES (?, ?)').run(label, position).lastInsertRowid;

    const unica = getOrCreate('Talla única', 0);
    const ids = TALLAS.map((t, i) => getOrCreate(t, i + 1));

    const products = db.prepare(`SELECT p.id FROM products p JOIN product_types t ON t.id = p.type_id
      WHERE t.slug IN (${TIPOS_CON_TALLAS.map(() => '?').join(',')})`).all(...TIPOS_CON_TALLAS);

    const delSize = db.prepare('DELETE FROM product_sizes WHERE product_id = ? AND size_id = ?');
    const addSize = db.prepare('INSERT OR IGNORE INTO product_sizes (product_id, size_id) VALUES (?, ?)');
    const fixCart = db.prepare('UPDATE cart_items SET size_id = ? WHERE product_id = ? AND size_id = ?');
    for (const { id } of products) {
      ids.forEach((sid) => addSize.run(id, sid));
      delSize.run(id, unica);
      fixCart.run(ids[0], id, unica);   // lo que ya estaba en la bolsa pasa a "Pequeña"
    }
    return products.length;
  })();
}

module.exports = { applySizes };

if (require.main === module) {
  console.log(`Tallas actualizadas en ${applySizes()} productos (collares y pañoletas).`);
}
