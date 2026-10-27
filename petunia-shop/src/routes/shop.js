const express = require('express');
const crypto = require('crypto');
const db = require('../../db');
const { hydrate } = require('../products');
const { rateLimit, requireAuth } = require('../auth');

const router = express.Router();
const BASE = require('../products').BASE;

/* ───────── Favoritos ───────── */
router.get('/favorites', (req, res) => {
  const rows = db.prepare(`${BASE} JOIN favorites f ON f.product_id = p.id WHERE f.${req.owner.col} = ? AND p.active = 1
    ORDER BY f.id DESC`).all(req.owner.val);
  res.json(hydrate(rows, req.owner));
});

router.post('/favorites/:productId/toggle', (req, res) => {
  const id = parseInt(req.params.productId, 10);
  if (!db.prepare('SELECT 1 FROM products WHERE id = ? AND active = 1').get(id)) return res.status(404).json({ error: 'Producto no encontrado.' });
  const { col, val } = req.owner;
  const existing = db.prepare(`SELECT id FROM favorites WHERE ${col} = ? AND product_id = ?`).get(val, id);
  if (existing) db.prepare('DELETE FROM favorites WHERE id = ?').run(existing.id);
  else db.prepare(`INSERT INTO favorites (${col}, product_id) VALUES (?, ?)`).run(val, id);
  const count = db.prepare(`SELECT COUNT(*) n FROM favorites WHERE ${col} = ?`).get(val).n;
  res.json({ favorite: !existing, count });
});

/* Impuesto 8,8 % y envío fijo de $15, calculados en centavos para no arrastrar decimales. */
const TAX_RATE = 0.088;
const SHIPPING_CENTS = 1500;

function quoteCart(rows) {
  const subtotalCents = rows.reduce((n, r) => n + r.priceCents * r.qty, 0);
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  const shippingCents = rows.length ? SHIPPING_CENTS : 0;
  return { subtotalCents, taxCents, shippingCents, totalCents: subtotalCents + taxCents + shippingCents };
}

/* ───────── Bolsa ───────── */
function cartPayload(owner) {
  const rows = db.prepare(`
    SELECT ci.id, ci.qty, p.id AS productId, p.slug, p.name, COALESCE(p.sale_price_cents, p.price_cents) AS priceCents, p.stock,
           pc.name AS colorName, pc.hex AS colorHex, s.label AS sizeLabel,
           (SELECT file FROM product_images WHERE product_id = p.id ORDER BY position LIMIT 1) AS image
    FROM cart_items ci JOIN products p ON p.id = ci.product_id
    LEFT JOIN product_colors pc ON pc.id = ci.color_id LEFT JOIN sizes s ON s.id = ci.size_id
    WHERE ci.${owner.col} = ? AND p.active = 1 ORDER BY ci.id`).all(owner.val);
  const items = rows.map((r) => ({
    id: r.id, productId: r.productId, slug: r.slug, name: r.name, image: r.image && `media/${r.image}`,
    color: r.colorName ? { name: r.colorName, hex: r.colorHex } : null, size: r.sizeLabel,
    qty: r.qty, stock: r.stock, unitPrice: r.priceCents / 100, lineTotal: (r.priceCents * r.qty) / 100,
  }));
  const quote = quoteCart(rows);
  return {
    items,
    count: items.reduce((n, i) => n + i.qty, 0),
    subtotal: quote.subtotalCents / 100,
    tax: quote.taxCents / 100,
    shipping: quote.shippingCents / 100,
    total: quote.totalCents / 100,
    totalCents: quote.totalCents,
  };
}

router.get('/cart', (req, res) => res.json(cartPayload(req.owner)));

router.post('/cart', (req, res) => {
  const productId = parseInt(req.body.productId, 10);
  const qty = Math.min(Math.max(parseInt(req.body.qty, 10) || 1, 1), 99);
  const p = db.prepare('SELECT id, name, stock FROM products WHERE id = ? AND active = 1').get(productId);
  if (!p) return res.status(404).json({ error: 'Producto no encontrado.' });

  // Color y talla: si no se eligen, se usa la primera opción disponible.
  let colorId = req.body.colorId ? parseInt(req.body.colorId, 10) : null;
  if (colorId && !db.prepare('SELECT 1 FROM product_colors WHERE id = ? AND product_id = ?').get(colorId, p.id)) return res.status(400).json({ error: 'Color no válido.' });
  if (!colorId) colorId = db.prepare('SELECT id FROM product_colors WHERE product_id = ? ORDER BY position LIMIT 1').get(p.id)?.id ?? null;
  let sizeId = req.body.sizeId ? parseInt(req.body.sizeId, 10) : null;
  if (sizeId && !db.prepare('SELECT 1 FROM product_sizes WHERE size_id = ? AND product_id = ?').get(sizeId, p.id)) return res.status(400).json({ error: 'Talla no válida.' });
  if (!sizeId) sizeId = db.prepare('SELECT size_id FROM product_sizes WHERE product_id = ? LIMIT 1').get(p.id)?.size_id ?? null;

  const { col, val } = req.owner;
  const existing = db.prepare(`SELECT id, qty FROM cart_items WHERE ${col} = ? AND product_id = ? AND color_id IS ? AND size_id IS ?`).get(val, p.id, colorId, sizeId);
  const newQty = (existing ? existing.qty : 0) + qty;
  if (newQty > p.stock) return res.status(409).json({ error: `Solo quedan ${p.stock} unidades de ${p.name}.` });
  if (existing) db.prepare('UPDATE cart_items SET qty = ? WHERE id = ?').run(Math.min(newQty, 99), existing.id);
  else db.prepare(`INSERT INTO cart_items (${col}, product_id, color_id, size_id, qty) VALUES (?,?,?,?,?)`).run(val, p.id, colorId, sizeId, qty);
  res.status(201).json({ ...cartPayload(req.owner), added: p.name });
});

router.patch('/cart/:id', (req, res) => {
  const qty = parseInt(req.body.qty, 10);
  if (!(qty >= 1 && qty <= 99)) return res.status(400).json({ error: 'Cantidad no válida.' });
  const item = db.prepare(`SELECT ci.id, p.stock, p.name FROM cart_items ci JOIN products p ON p.id = ci.product_id
    WHERE ci.id = ? AND ci.${req.owner.col} = ?`).get(req.params.id, req.owner.val);
  if (!item) return res.status(404).json({ error: 'Artículo no encontrado.' });
  if (qty > item.stock) return res.status(409).json({ error: `Solo quedan ${item.stock} unidades de ${item.name}.` });
  db.prepare('UPDATE cart_items SET qty = ? WHERE id = ?').run(qty, item.id);
  res.json(cartPayload(req.owner));
});

router.delete('/cart/:id', (req, res) => {
  db.prepare(`DELETE FROM cart_items WHERE id = ? AND ${req.owner.col} = ?`).run(req.params.id, req.owner.val);
  res.json(cartPayload(req.owner));
});

/* ───────── Pedidos ───────── */
const orderLimiter = rateLimit({ windowMs: 10 * 60e3, max: 20 });
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/orders', requireAuth, orderLimiter, (req, res) => {
  const name = text(req.body.name, 100), email = text(req.body.email, 160);
  const phone = text(req.body.phone, 40), address = text(req.body.address, 300), notes = text(req.body.notes, 500);
  if (!name || !address) return res.status(400).json({ error: 'Completa tu nombre y la dirección de entrega.' });
  if (!EMAIL.test(email)) return res.status(400).json({ error: 'Escribe un correo válido.' });

  try {
    const order = db.transaction(() => {
      const cart = cartPayload(req.owner);
      if (!cart.items.length) throw Object.assign(new Error('Tu bolsa está vacía.'), { status: 400 });
      const code = 'PET-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      const orderId = db.prepare(`INSERT INTO orders (code,user_id,customer_name,email,phone,address,notes,subtotal_cents)
        VALUES (?,?,?,?,?,?,?,?)`).run(code, req.user?.id ?? null, name, email, phone, address, notes,
        cart.totalCents).lastInsertRowid;
      for (const i of cart.items) {
        const upd = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?').run(i.qty, i.productId, i.qty);
        if (!upd.changes) throw Object.assign(new Error(`${i.name} ya no tiene suficiente stock.`), { status: 409 });
        db.prepare(`INSERT INTO order_items (order_id,product_id,name,color_name,size_label,unit_price_cents,qty) VALUES (?,?,?,?,?,?,?)`)
          .run(orderId, i.productId, i.name, i.color?.name ?? null, i.size, Math.round(i.unitPrice * 100), i.qty);
      }
      db.prepare(`DELETE FROM cart_items WHERE ${req.owner.col} = ?`).run(req.owner.val);
      return { code, total: cart.total, subtotal: cart.subtotal, tax: cart.tax, shipping: cart.shipping };
    })();
    res.status(201).json(order);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

router.get('/orders', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Inicia sesión para ver tus pedidos.' });
  const orders = db.prepare(`SELECT id, code, status, subtotal_cents AS total, created_at AS createdAt FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 20`).all(req.user.id);
  for (const o of orders) {
    o.total /= 100;
    o.items = db.prepare('SELECT name, color_name AS color, qty, unit_price_cents / 100.0 AS unitPrice FROM order_items WHERE order_id = ?').all(o.id);
  }
  res.json(orders);
});

module.exports = router;
