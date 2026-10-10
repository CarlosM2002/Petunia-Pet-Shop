/* API de administración (requiere usuario con rol admin). */
const express = require('express');
const db = require('../../db');
const { requireAdmin } = require('../auth');
const { refreshSearchText } = require('../products');

const router = express.Router();
router.use(requireAdmin);

const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const lookup = (table, slug) => (slug ? db.prepare(`SELECT id FROM ${table} WHERE slug = ?`).get(slug)?.id ?? null : null);

router.get('/orders', (req, res) => {
  const orders = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 100').all();
  for (const o of orders) o.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
  res.json(orders);
});
router.patch('/orders/:id', (req, res) => {
  if (!['pending', 'paid', 'shipped', 'delivered', 'cancelled'].includes(req.body.status)) return res.status(400).json({ error: 'Estado no válido.' });
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(req.body.status, req.params.id);
  res.json({ ok: true });
});
router.get('/subscribers', (req, res) => res.json(db.prepare('SELECT * FROM newsletter_subscribers ORDER BY id DESC').all()));
router.get('/chats', (req, res) => res.json(db.prepare('SELECT * FROM chat_messages ORDER BY id DESC LIMIT 200').all()));
router.post('/chats/:visitorId', (req, res) => {
  db.prepare("INSERT INTO chat_messages (visitor_id, sender, body) VALUES (?, 'agent', ?)").run(req.params.visitorId, String(req.body.body || '').slice(0, 1000));
  res.status(201).json({ ok: true });
});
router.get('/searches', (req, res) => res.json(db.prepare(
  'SELECT term, COUNT(*) AS times, MAX(results) AS results FROM search_logs GROUP BY term ORDER BY times DESC LIMIT 50').all()));

/* Productos: crear / editar / archivar */
function writeProduct(id, b) {
  const f = {
    name: b.name, subtitle: b.subtitle ?? null, description: b.description ?? null,
    price_cents: b.price != null ? Math.round(Number(b.price) * 100) : undefined,
    category_id: lookup('categories', b.category), type_id: lookup('product_types', b.type),
    collection_id: lookup('collections', b.collection),
    is_new: b.isNew != null ? +!!b.isNew : undefined, is_bestseller: b.bestseller != null ? +!!b.bestseller : undefined,
    is_latest: b.latest != null ? +!!b.latest : undefined, stock: b.stock, active: b.active != null ? +!!b.active : undefined,
  };
  const keys = Object.keys(f).filter((k) => f[k] !== undefined && !(['category_id', 'type_id', 'collection_id'].includes(k) && f[k] === null && b[k.replace('_id', '')] == null));
  db.prepare(`UPDATE products SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...f, id });
  if (Array.isArray(b.images)) {
    db.prepare('DELETE FROM product_images WHERE product_id = ?').run(id);
    b.images.forEach((file, i) => db.prepare('INSERT INTO product_images (product_id,file,alt,position) VALUES (?,?,?,?)').run(id, file, b.name || null, i));
  }
  if (Array.isArray(b.colors)) {
    db.prepare('DELETE FROM product_colors WHERE product_id = ?').run(id);
    b.colors.forEach((c, i) => db.prepare('INSERT INTO product_colors (product_id,name,hex,position) VALUES (?,?,?,?)').run(id, c.name, c.hex, i));
  }
  refreshSearchText(id);
}

router.post('/products', (req, res) => {
  const b = req.body;
  if (!b.name || b.price == null || !lookup('categories', b.category)) return res.status(400).json({ error: 'Faltan nombre, precio o categoría válida.' });
  const slug = slugify(b.slug || b.name);
  if (db.prepare('SELECT 1 FROM products WHERE slug = ?').get(slug)) return res.status(409).json({ error: 'Ya existe un producto con ese slug.' });
  const id = db.transaction(() => {
    const id = db.prepare('INSERT INTO products (slug,name,price_cents,category_id,sort_order) VALUES (?,?,?,?,(SELECT COALESCE(MAX(sort_order),0)+1 FROM products))')
      .run(slug, b.name, 0, lookup('categories', b.category)).lastInsertRowid;
    const size = db.prepare('SELECT id FROM sizes ORDER BY position LIMIT 1').get();
    if (size) db.prepare('INSERT INTO product_sizes (product_id,size_id) VALUES (?,?)').run(id, size.id);
    writeProduct(id, b);
    return id;
  })();
  res.status(201).json({ id, slug });
});
router.put('/products/:id', (req, res) => { writeProduct(Number(req.params.id), req.body); res.json({ ok: true }); });
router.delete('/products/:id', (req, res) => { db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id); res.json({ ok: true }); });

module.exports = router;
