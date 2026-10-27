/* API de administración (requiere usuario con rol admin). */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../../db');
const { requireAdmin } = require('../auth');
const { refreshSearchText } = require('../products');
const { recomputeSales, promoStatus } = require('../promotions');
const { INFO_KEYS, PROMO_KEYS } = require('../../db/migrate');

const router = express.Router();
router.use(requireAdmin);

const MEDIA_DIR = path.join(__dirname, '..', '..', 'public', 'media');
const all = (sql, ...a) => db.prepare(sql).all(...a);
const get = (sql, ...a) => db.prepare(sql).get(...a);
const run = (sql, ...a) => db.prepare(sql).run(...a);
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const slugify = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const uniqueSlug = (table, base) => {
  let slug = base || crypto.randomBytes(3).toString('hex'), n = 2;
  while (get(`SELECT 1 FROM ${table} WHERE slug = ?`, slug)) slug = `${base}-${n++}`;
  return slug;
};
const reorder = (table, ids) => {
  const upd = db.prepare(`UPDATE ${table} SET position = ? WHERE id = ?`);
  db.transaction(() => ids.forEach((id, i) => upd.run(i + 1, int(id))))();
};

/* ───────── Resumen y datos de apoyo ───────── */
router.get('/stats', (req, res) => {
  res.json({
    ordersByStatus: Object.fromEntries(all('SELECT status, COUNT(*) n FROM orders GROUP BY status').map((r) => [r.status, r.n])),
    revenueCents: get("SELECT COALESCE(SUM(subtotal_cents),0) n FROM orders WHERE status != 'cancelled'").n,
    users: get('SELECT COUNT(*) n FROM users').n,
    products: get('SELECT COUNT(*) n FROM products WHERE active = 1').n,
    lowStock: all('SELECT id, name, stock FROM products WHERE active = 1 AND stock <= 5 ORDER BY stock, name LIMIT 10'),
  });
});

router.get('/meta', (req, res) => res.json({
  categories: all('SELECT slug, name FROM categories ORDER BY id'),
  types: all('SELECT slug, name FROM product_types ORDER BY name'),
  collections: all('SELECT slug, name FROM collections ORDER BY position, id'),
  sizes: all('SELECT label FROM sizes ORDER BY position').map((s) => s.label),
}));

/* ───────── Pedidos ───────── */
const STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];

router.get('/orders', (req, res) => {
  const where = [], args = [];
  if (STATUSES.includes(req.query.status)) { where.push('status = ?'); args.push(req.query.status); }
  const q = text(req.query.q, 80).toLowerCase();
  if (q) { where.push('(lower(code) LIKE ? OR lower(customer_name) LIKE ? OR lower(email) LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = 25, page = Math.max(int(req.query.page, 1), 1);
  const total = get(`SELECT COUNT(*) n FROM orders ${w}`, ...args).n;
  const orders = all(`SELECT id, code, user_id AS userId, customer_name AS customerName, email, phone, address, notes, status,
      subtotal_cents AS totalCents, created_at AS createdAt FROM orders ${w} ORDER BY id DESC LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit);
  for (const o of orders) o.items = all(`SELECT name, color_name AS color, size_label AS size, unit_price_cents AS unitPriceCents, qty
    FROM order_items WHERE order_id = ?`, o.id);
  res.json({ orders, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.patch('/orders/:id', (req, res) => {
  const status = req.body.status;
  if (!STATUSES.includes(status)) return bad(res, 'Estado no válido.');
  const order = get('SELECT id, status FROM orders WHERE id = ?', req.params.id);
  if (!order) return bad(res, 'Pedido no encontrado.', 404);
  try {
    db.transaction(() => {
      const items = all('SELECT product_id, qty, name FROM order_items WHERE order_id = ?', order.id);
      if (status === 'cancelled' && order.status !== 'cancelled') {      // al cancelar, el stock vuelve
        for (const it of items) if (it.product_id) run('UPDATE products SET stock = stock + ? WHERE id = ?', it.qty, it.product_id);
      } else if (order.status === 'cancelled' && status !== 'cancelled') { // al reactivar, se descuenta otra vez
        for (const it of items) if (it.product_id && !run('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?', it.qty, it.product_id, it.qty).changes)
          throw Object.assign(new Error(`No hay suficiente stock de ${it.name} para reactivar el pedido.`), { status: 409 });
      }
      run('UPDATE orders SET status = ? WHERE id = ?', status, order.id);
    })();
  } catch (e) {
    if (e.status) return bad(res, e.message, e.status);
    throw e;
  }
  res.json({ ok: true, status });
});

/* ───────── Clientes ───────── */
router.get('/customers', (req, res) => {
  const users = all(`SELECT u.id, u.name, u.email, u.role, u.created_at AS createdAt, COUNT(o.id) AS orders,
      COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.subtotal_cents END), 0) AS spentCents, MAX(o.created_at) AS lastOrderAt
    FROM users u LEFT JOIN orders o ON o.user_id = u.id GROUP BY u.id ORDER BY u.id DESC LIMIT 500`);
  const buyers = all(`SELECT lower(email) AS email, MAX(customer_name) AS name, MAX(phone) AS phone, COUNT(*) AS orders,
      COALESCE(SUM(CASE WHEN status != 'cancelled' THEN subtotal_cents END), 0) AS spentCents, MAX(created_at) AS lastOrderAt,
      MAX(user_id IS NOT NULL) AS registered FROM orders GROUP BY lower(email) ORDER BY lastOrderAt DESC LIMIT 500`);
  const latest = all(`SELECT id, code, customer_name AS customerName, email, status, subtotal_cents AS totalCents, created_at AS createdAt
    FROM orders ORDER BY id DESC LIMIT 25`);
  for (const o of latest) o.items = all('SELECT name, qty FROM order_items WHERE order_id = ?', o.id);
  res.json({ users, buyers, latest });
});

/* ───────── Imágenes ───────── */
router.get('/media', (req, res) => {
  const files = fs.existsSync(MEDIA_DIR) ? fs.readdirSync(MEDIA_DIR).filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f)) : [];
  res.json(files.map((f) => ({ f, t: fs.statSync(path.join(MEDIA_DIR, f)).mtimeMs })).sort((a, b) => b.t - a.t).map((x) => x.f));
});

function sniffImage(b) {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}
router.post('/upload', (req, res) => {          // el cuerpo llega como Buffer (express.raw en server.js)
  const buf = req.body;
  const ext = Buffer.isBuffer(buf) && buf.length ? sniffImage(buf) : null;
  if (!ext) return bad(res, 'Sube una imagen JPG, PNG o WebP (máx. 8 MB).');
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const file = `p-${crypto.randomBytes(5).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(MEDIA_DIR, file), buf);
  res.status(201).json({ file });
});

/* ───────── Productos ───────── */
const HEX = /^#[0-9a-f]{6}$/i;
const lookupId = (table, slug) => (slug ? get(`SELECT id FROM ${table} WHERE slug = ?`, slug)?.id ?? null : null);

router.get('/products', (req, res) => {
  const where = [], args = [];
  const status = req.query.status || 'active';
  if (status === 'active') where.push('p.active = 1'); else if (status === 'archived') where.push('p.active = 0');
  if (req.query.category) { where.push('cat.slug = ?'); args.push(String(req.query.category)); }
  const q = text(req.query.q, 80).toLowerCase();
  if (q) { where.push('(lower(p.name) LIKE ? OR lower(p.subtitle) LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  res.json(all(`SELECT p.id, p.slug, p.name, p.subtitle, p.price_cents AS priceCents, p.sale_price_cents AS salePriceCents, p.stock, p.active,
      p.is_new AS isNew, p.is_bestseller AS bestseller, p.is_latest AS latest, cat.slug AS category, cat.name AS categoryName,
      t.name AS type, c.name AS collection,
      (SELECT file FROM product_images WHERE product_id = p.id ORDER BY position LIMIT 1) AS image
    FROM products p JOIN categories cat ON cat.id = p.category_id
    LEFT JOIN product_types t ON t.id = p.type_id LEFT JOIN collections c ON c.id = p.collection_id
    ${w} ORDER BY p.sort_order, p.id LIMIT 500`, ...args));
});

function productDetail(id) {
  const p = get(`SELECT p.*, cat.slug AS category_slug, t.slug AS type_slug, c.slug AS collection_slug FROM products p
    JOIN categories cat ON cat.id = p.category_id LEFT JOIN product_types t ON t.id = p.type_id
    LEFT JOIN collections c ON c.id = p.collection_id WHERE p.id = ?`, id);
  if (!p) return null;
  return {
    id: p.id, slug: p.slug, name: p.name, subtitle: p.subtitle || '', description: p.description || '',
    priceCents: p.price_cents, salePriceCents: p.sale_price_cents, stock: p.stock, active: !!p.active,
    isNew: !!p.is_new, bestseller: !!p.is_bestseller, latest: !!p.is_latest,
    category: p.category_slug, type: p.type_slug || '', collection: p.collection_slug || '',
    images: all('SELECT file FROM product_images WHERE product_id = ? ORDER BY position', id).map((r) => r.file),
    colors: all('SELECT id, name, hex FROM product_colors WHERE product_id = ? ORDER BY position', id),
    sizes: all('SELECT s.label FROM product_sizes ps JOIN sizes s ON s.id = ps.size_id WHERE ps.product_id = ? ORDER BY s.position', id).map((r) => r.label),
    sections: all('SELECT title, body, is_open AS open FROM product_sections WHERE product_id = ? ORDER BY position', id).map((s) => ({ ...s, open: !!s.open })),
  };
}
router.get('/products/:id', (req, res) => {
  const p = productDetail(int(req.params.id));
  p ? res.json(p) : bad(res, 'Producto no encontrado.', 404);
});

function validateProduct(b, creating) {
  const name = text(b.name, 120);
  if (!name) return { error: 'Escribe el nombre del producto.' };
  const price = Number(b.price);
  if (!(price >= 0) || price > 100000) return { error: 'El precio no es válido.' };
  const stock = int(b.stock, 0);
  if (stock < 0 || stock > 100000) return { error: 'El stock no es válido.' };
  const category_id = lookupId('categories', b.category);
  if (!category_id) return { error: 'Elige una categoría.' };
  const type_id = lookupId('product_types', b.type);
  if (b.type && !type_id) return { error: 'Tipo de producto no válido.' };
  const collection_id = lookupId('collections', b.collection);
  if (b.collection && !collection_id) return { error: 'Colección no válida.' };

  const colors = (Array.isArray(b.colors) ? b.colors : []).slice(0, 20).map((c) => ({ id: int(c.id, 0), name: text(c.name, 40), hex: String(c.hex || '') }));
  if (colors.some((c) => !c.name || !HEX.test(c.hex))) return { error: 'Cada color necesita nombre y un tono válido.' };
  const images = (Array.isArray(b.images) ? b.images : []).slice(0, 10).map((f) => path.basename(String(f)));
  const missing = images.find((f) => !/^[\w.\-]+\.(jpe?g|png|webp|gif)$/i.test(f) || !fs.existsSync(path.join(MEDIA_DIR, f)));
  if (missing) return { error: `La imagen "${missing}" no existe en public/media.` };
  const sizeRows = (Array.isArray(b.sizes) ? b.sizes : (creating ? ['Talla única'] : [])).map((l) => get('SELECT id FROM sizes WHERE label = ?', String(l)));
  if (sizeRows.some((r) => !r)) return { error: 'Talla no válida.' };
  const sections = Array.isArray(b.sections)
    ? b.sections.slice(0, 10).map((s) => ({ title: text(s.title, 80), body: text(s.body, 2000), open: +!!s.open })).filter((s) => s.title && s.body) : null;

  return { data: {
    name, subtitle: text(b.subtitle, 160), description: text(b.description, 2000), price_cents: Math.round(price * 100), stock,
    category_id, type_id, collection_id, is_new: +!!b.isNew, is_bestseller: +!!b.bestseller, is_latest: +!!b.latest,
    active: b.active === undefined ? 1 : +!!b.active, colors, images, sizeIds: sizeRows.map((r) => r.id), sections } };
}

function saveProduct(id, d) {
  db.transaction(() => {
    run(`UPDATE products SET name=?, subtitle=?, description=?, price_cents=?, stock=?, category_id=?, type_id=?, collection_id=?,
      is_new=?, is_bestseller=?, is_latest=?, active=? WHERE id=?`, d.name, d.subtitle, d.description, d.price_cents, d.stock,
      d.category_id, d.type_id, d.collection_id, d.is_new, d.is_bestseller, d.is_latest, d.active, id);

    run('DELETE FROM product_images WHERE product_id = ?', id);
    d.images.forEach((f, i) => run('INSERT INTO product_images (product_id,file,alt,position) VALUES (?,?,?,?)', id, f, d.name, i));

    const keep = new Set(all('SELECT id FROM product_colors WHERE product_id = ?', id).map((r) => r.id));
    const kept = d.colors.filter((c) => keep.has(c.id)).map((c) => c.id);
    run(`DELETE FROM product_colors WHERE product_id = ? ${kept.length ? `AND id NOT IN (${kept.map(() => '?').join(',')})` : ''}`, id, ...kept);
    d.colors.forEach((c, i) => keep.has(c.id)
      ? run('UPDATE product_colors SET name=?, hex=?, position=? WHERE id=?', c.name, c.hex, i, c.id)
      : run('INSERT INTO product_colors (product_id,name,hex,position) VALUES (?,?,?,?)', id, c.name, c.hex, i));

    run('DELETE FROM product_sizes WHERE product_id = ?', id);
    d.sizeIds.forEach((sid) => run('INSERT INTO product_sizes (product_id,size_id) VALUES (?,?)', id, sid));
    if (d.sizeIds.length) run(`UPDATE cart_items SET size_id = ? WHERE product_id = ? AND (size_id IS NULL OR size_id NOT IN (${d.sizeIds.map(() => '?').join(',')}))`,
      d.sizeIds[0], id, ...d.sizeIds);

    if (d.sections) {
      run('DELETE FROM product_sections WHERE product_id = ?', id);
      d.sections.forEach((s, i) => run('INSERT INTO product_sections (product_id,title,body,is_open,position) VALUES (?,?,?,?,?)', id, s.title, s.body, s.open, i));
    }
  })();
  refreshSearchText(id);
  recomputeSales();
}

router.post('/products', (req, res) => {
  const { data: d, error } = validateProduct(req.body, true);
  if (error) return bad(res, error);
  const slug = uniqueSlug('products', slugify(req.body.slug || d.name));
  const id = run('INSERT INTO products (slug,name,price_cents,category_id,sort_order) VALUES (?,?,0,?,(SELECT COALESCE(MAX(sort_order),0)+1 FROM products))',
    slug, d.name, d.category_id).lastInsertRowid;
  if (!d.sections) d.sections = [
    { title: 'Descripción', body: d.description || `${d.subtitle || d.name} de Petunia Pet Shop.`, open: 0 },
    { title: 'Detalles', body: `${d.name}: ${d.subtitle || 'accesorio'} de Petunia Pet Shop. Un diseño pensado para acompañar a tu mascota.`, open: 1 },
    { title: 'Tela y cuidados', body: 'Consulta con nuestro equipo los materiales y las indicaciones de cuidado de este producto.', open: 0 },
    { title: 'Envíos y devoluciones', body: 'Para conocer los detalles de envío o solicitar ayuda con tu pedido, ponte en contacto con nuestro equipo.', open: 1 }];
  saveProduct(Number(id), d);
  res.status(201).json({ id: Number(id), slug });
});

router.put('/products/:id', (req, res) => {
  const id = int(req.params.id);
  if (!get('SELECT 1 FROM products WHERE id = ?', id)) return bad(res, 'Producto no encontrado.', 404);
  const { data: d, error } = validateProduct(req.body, false);
  if (error) return bad(res, error);
  saveProduct(id, d);
  res.json({ ok: true });
});

router.patch('/products/:id', (req, res) => {          // archivar / restaurar rápido
  run('UPDATE products SET active = ? WHERE id = ?', +!!req.body.active, int(req.params.id));
  recomputeSales();
  res.json({ ok: true });
});

router.delete('/products/:id', (req, res) => {
  const id = int(req.params.id);
  if (req.query.hard === '1') run('DELETE FROM products WHERE id = ?', id);    // definitivo (pedidos antiguos conservan nombre y precio)
  else run('UPDATE products SET active = 0 WHERE id = ?', id);                 // archivar: se oculta de la tienda
  recomputeSales();
  res.json({ ok: true });
});

/* ───────── Colecciones ───────── */
router.get('/collections', (req, res) => res.json(all(`SELECT c.id, c.slug, c.name, c.description, c.image, c.position,
  (SELECT COUNT(*) FROM products p WHERE p.collection_id = c.id AND p.active = 1) AS products
  FROM collections c ORDER BY c.position, c.id`)));

router.post('/collections/reorder', (req, res) => {
  if (!Array.isArray(req.body.ids)) return bad(res, 'Orden no válido.');
  reorder('collections', req.body.ids); res.json({ ok: true });
});
const mediaFile = (f) => {                       // nombre de imagen válido y existente, o null
  const name = path.basename(String(f || ''));
  return name && /^[\w.\-]+\.(jpe?g|png|webp|gif)$/i.test(name) && fs.existsSync(path.join(MEDIA_DIR, name)) ? name : null;
};
router.post('/collections', (req, res) => {
  const name = text(req.body.name, 80);
  if (!name) return bad(res, 'Escribe el nombre de la colección.');
  if (req.body.image && !mediaFile(req.body.image)) return bad(res, 'La imagen no existe en public/media.');
  const slug = uniqueSlug('collections', slugify(name));
  const id = run('INSERT INTO collections (slug,name,description,image,position) VALUES (?,?,?,?,(SELECT COALESCE(MAX(position),0)+1 FROM collections))',
    slug, name, text(req.body.description, 300), mediaFile(req.body.image)).lastInsertRowid;
  res.status(201).json({ id: Number(id), slug });
});
router.put('/collections/:id', (req, res) => {
  const name = text(req.body.name, 80);
  if (!name) return bad(res, 'Escribe el nombre de la colección.');
  if (req.body.image && !mediaFile(req.body.image)) return bad(res, 'La imagen no existe en public/media.');
  run('UPDATE collections SET name = ?, description = ?, image = ? WHERE id = ?', name, text(req.body.description, 300), mediaFile(req.body.image), int(req.params.id));
  res.json({ ok: true });
});
router.delete('/collections/:id', (req, res) => {
  const id = int(req.params.id);
  db.transaction(() => { run('UPDATE products SET collection_id = NULL WHERE collection_id = ?', id); run('DELETE FROM collections WHERE id = ?', id); })();
  recomputeSales();
  res.json({ ok: true });
});

/* ───────── Promociones ───────── */
const SCOPES = ['all', 'category', 'collection', 'products'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const promoOut = (p) => ({
  id: p.id, name: p.name, percent: p.percent, scope: p.scope, scopeRef: p.scope_ref, startsAt: p.starts_at || '', endsAt: p.ends_at || '',
  active: !!p.active, position: p.position, status: promoStatus(p),
  productIds: all('SELECT product_id FROM promotion_products WHERE promotion_id = ?', p.id).map((r) => r.product_id),
});
router.get('/promotions', (req, res) => res.json(all('SELECT * FROM promotions ORDER BY position, id').map(promoOut)));

function validatePromo(b) {
  const name = text(b.name, 80), percent = int(b.percent, 0), scope = b.scope;
  if (!name) return { error: 'Escribe el nombre de la promoción.' };
  if (percent < 1 || percent > 90) return { error: 'El descuento debe estar entre 1% y 90%.' };
  if (!SCOPES.includes(scope)) return { error: 'Elige a qué productos aplica.' };
  let scopeRef = null, productIds = [];
  if (scope === 'category' || scope === 'collection') {
    scopeRef = String(b.scopeRef || '');
    if (!lookupId(scope === 'category' ? 'categories' : 'collections', scopeRef)) return { error: 'Elige una categoría o colección válida.' };
  }
  if (scope === 'products') {
    productIds = [...new Set((Array.isArray(b.productIds) ? b.productIds : []).map((x) => int(x)))].filter((id) => get('SELECT 1 FROM products WHERE id = ?', id));
    if (!productIds.length) return { error: 'Elige al menos un producto.' };
  }
  const startsAt = b.startsAt ? String(b.startsAt) : null, endsAt = b.endsAt ? String(b.endsAt) : null;
  if ((startsAt && !DATE.test(startsAt)) || (endsAt && !DATE.test(endsAt))) return { error: 'Fecha no válida.' };
  if (startsAt && endsAt && endsAt < startsAt) return { error: 'La fecha final es anterior a la inicial.' };
  return { data: { name, percent, scope, scopeRef, productIds, startsAt, endsAt, active: b.active === undefined ? 1 : +!!b.active } };
}
function savePromo(id, d) {
  db.transaction(() => {
    run('UPDATE promotions SET name=?, percent=?, scope=?, scope_ref=?, starts_at=?, ends_at=?, active=? WHERE id=?',
      d.name, d.percent, d.scope, d.scopeRef, d.startsAt, d.endsAt, d.active, id);
    run('DELETE FROM promotion_products WHERE promotion_id = ?', id);
    d.productIds.forEach((pid) => run('INSERT INTO promotion_products (promotion_id, product_id) VALUES (?,?)', id, pid));
  })();
  recomputeSales();
}
router.post('/promotions/reorder', (req, res) => {
  if (!Array.isArray(req.body.ids)) return bad(res, 'Orden no válido.');
  reorder('promotions', req.body.ids); recomputeSales(); res.json({ ok: true });
});
router.post('/promotions', (req, res) => {
  const { data: d, error } = validatePromo(req.body);
  if (error) return bad(res, error);
  const id = Number(run('INSERT INTO promotions (name, percent, position) VALUES (?, ?, (SELECT COALESCE(MAX(position),0)+1 FROM promotions))', d.name, d.percent).lastInsertRowid);
  savePromo(id, d);
  res.status(201).json({ id });
});
router.put('/promotions/:id', (req, res) => {
  const id = int(req.params.id);
  if (!get('SELECT 1 FROM promotions WHERE id = ?', id)) return bad(res, 'Promoción no encontrada.', 404);
  const { data: d, error } = validatePromo(req.body);
  if (error) return bad(res, error);
  savePromo(id, d); res.json({ ok: true });
});
router.patch('/promotions/:id', (req, res) => {
  run('UPDATE promotions SET active = ? WHERE id = ?', +!!req.body.active, int(req.params.id));
  recomputeSales(); res.json({ ok: true });
});
router.delete('/promotions/:id', (req, res) => { run('DELETE FROM promotions WHERE id = ?', int(req.params.id)); recomputeSales(); res.json({ ok: true }); });

router.get('/promo-page', (req, res) => res.json(Object.fromEntries(all('SELECT key, value FROM site_settings').filter((r) => PROMO_KEYS.includes(r.key)).map((r) => [r.key, r.value]))));
router.put('/promo-page', (req, res) => {
  db.transaction(() => {
    for (const k of PROMO_KEYS) if (typeof req.body[k] === 'string')
      run('INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, text(req.body[k], 500));
  })();
  res.json({ ok: true });
});

/* ───────── Página de ayuda / información ───────── */
router.get('/help', (req, res) => res.json({
  settings: Object.fromEntries(all('SELECT key, value FROM site_settings').filter((r) => INFO_KEYS.includes(r.key)).map((r) => [r.key, r.value])),
  faqs: all('SELECT id, question, answer FROM faqs ORDER BY position, id'),
}));
router.put('/help/settings', (req, res) => {
  db.transaction(() => {
    for (const k of INFO_KEYS) if (typeof req.body[k] === 'string')
      run('INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, text(req.body[k], 1500));
  })();
  res.json({ ok: true });
});
router.post('/faqs/reorder', (req, res) => {
  if (!Array.isArray(req.body.ids)) return bad(res, 'Orden no válido.');
  reorder('faqs', req.body.ids); res.json({ ok: true });
});
router.post('/faqs', (req, res) => {
  const question = text(req.body.question, 200), answer = text(req.body.answer, 2000);
  if (!question || !answer) return bad(res, 'Escribe la pregunta y la respuesta.');
  const id = run('INSERT INTO faqs (question, answer, position) VALUES (?, ?, (SELECT COALESCE(MAX(position),0)+1 FROM faqs))', question, answer).lastInsertRowid;
  res.status(201).json({ id: Number(id) });
});
router.put('/faqs/:id', (req, res) => {
  const question = text(req.body.question, 200), answer = text(req.body.answer, 2000);
  if (!question || !answer) return bad(res, 'Escribe la pregunta y la respuesta.');
  run('UPDATE faqs SET question = ?, answer = ? WHERE id = ?', question, answer, int(req.params.id));
  res.json({ ok: true });
});
router.delete('/faqs/:id', (req, res) => { run('DELETE FROM faqs WHERE id = ?', int(req.params.id)); res.json({ ok: true }); });

/* ───────── Otros (ya existían) ───────── */
router.get('/subscribers', (req, res) => res.json(all('SELECT * FROM newsletter_subscribers ORDER BY id DESC')));
router.get('/chats', (req, res) => res.json(all('SELECT * FROM chat_messages ORDER BY id DESC LIMIT 200')));
router.post('/chats/:visitorId', (req, res) => {
  run("INSERT INTO chat_messages (visitor_id, sender, body) VALUES (?, 'agent', ?)", req.params.visitorId, String(req.body.body || '').slice(0, 1000));
  res.status(201).json({ ok: true });
});
router.get('/searches', (req, res) => res.json(all(
  'SELECT term, COUNT(*) AS times, MAX(results) AS results FROM search_logs GROUP BY term ORDER BY times DESC LIMIT 50')));

module.exports = router;
