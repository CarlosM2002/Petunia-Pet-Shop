/* Promociones: calcula products.sale_price_cents a partir de las promociones vigentes.
   Si un producto entra en varias, gana la primera de la lista (orden del panel). */
const db = require('../db');

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Panama' }); // YYYY-MM-DD

function promoStatus(p, t = today()) {
  if (!p.active) return 'pausada';
  if (p.starts_at && p.starts_at > t) return 'programada';
  if (p.ends_at && p.ends_at < t) return 'vencida';
  return 'activa';
}

function targetIds(p) {
  if (p.scope === 'all') return db.prepare('SELECT id FROM products WHERE active = 1').all().map((r) => r.id);
  if (p.scope === 'category') return db.prepare(`SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id
    WHERE p.active = 1 AND c.slug = ?`).all(p.scope_ref).map((r) => r.id);
  if (p.scope === 'collection') return db.prepare(`SELECT p.id FROM products p JOIN collections c ON c.id = p.collection_id
    WHERE p.active = 1 AND c.slug = ?`).all(p.scope_ref).map((r) => r.id);
  return db.prepare(`SELECT pp.product_id AS id FROM promotion_products pp JOIN products p ON p.id = pp.product_id
    WHERE pp.promotion_id = ? AND p.active = 1`).all(p.id).map((r) => r.id);
}

function recomputeSales() {
  db.transaction(() => {
    db.prepare('UPDATE products SET sale_price_cents = NULL WHERE sale_price_cents IS NOT NULL').run();
    const promos = db.prepare('SELECT * FROM promotions ORDER BY position, id').all()
      .filter((p) => promoStatus(p) === 'activa');
    const done = new Set();
    const upd = db.prepare(`UPDATE products SET sale_price_cents = CAST(ROUND(price_cents * (100 - ?) / 100.0) AS INTEGER)
      WHERE id = ? AND CAST(ROUND(price_cents * (100 - ?) / 100.0) AS INTEGER) < price_cents`);
    for (const p of promos) {
      for (const id of targetIds(p)) {
        if (done.has(id)) continue;
        done.add(id);
        upd.run(p.percent, id, p.percent);
      }
    }
  })();
}

module.exports = { recomputeSales, promoStatus, today };
