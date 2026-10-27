const db = require('../db');

/* Raíz simple de una palabra para que "navidad" encuentre "navideña" y "collares" encuentre "collar". */
const stem = (t) => {
  if (t.length > 4) t = t.replace(/(es|s)$/, '');
  return t.length >= 7 ? t.slice(0, 5) : t;
};
const normalize = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/* Recalcula el texto de búsqueda (sin tildes) de un producto. */
function refreshSearchText(productId) {
  const p = db.prepare(`SELECT p.name, p.subtitle, p.description, t.name AS type, c.name AS collection
    FROM products p LEFT JOIN product_types t ON t.id = p.type_id LEFT JOIN collections c ON c.id = p.collection_id
    WHERE p.id = ?`).get(productId);
  if (!p) return;
  const categories = db.prepare(`SELECT c.name FROM product_categories pc JOIN categories c ON c.id = pc.category_id
    WHERE pc.product_id = ?`).all(productId).map((c) => c.name);
  const colors = db.prepare('SELECT name FROM product_colors WHERE product_id = ?').all(productId).map((c) => c.name);
  const text = normalize([p.name, p.subtitle, p.description, p.type, p.collection, ...categories, ...colors].join(' '));
  db.prepare('UPDATE products SET search_text = ? WHERE id = ?').run(text, productId);
}

const BASE = `SELECT p.*, t.slug AS type_slug, t.name AS type_name, c.slug AS collection_slug, c.name AS collection_name, cat.slug AS category_slug
  FROM products p JOIN categories cat ON cat.id = p.category_id
  LEFT JOIN product_types t ON t.id = p.type_id LEFT JOIN collections c ON c.id = p.collection_id`;

const placeholders = (n) => new Array(n).fill('?').join(',');

/* Convierte filas en objetos listos para el frontend (imágenes, colores y favorito en consultas por lote). */
function hydrate(rows, owner) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const ph = placeholders(ids.length);
  const images = db.prepare(`SELECT product_id, file, alt FROM product_images WHERE product_id IN (${ph}) ORDER BY position`).all(...ids);
  const colors = db.prepare(`SELECT id, product_id, name, hex FROM product_colors WHERE product_id IN (${ph}) ORDER BY position`).all(...ids);
  const favs = new Set(db.prepare(`SELECT product_id FROM favorites WHERE ${owner.col} = ? AND product_id IN (${ph})`)
    .all(owner.val, ...ids).map((f) => f.product_id));
  const categories = db.prepare(`SELECT pc.product_id, c.slug FROM product_categories pc
    JOIN categories c ON c.id = pc.category_id WHERE pc.product_id IN (${ph}) ORDER BY c.id`).all(...ids);
  const by = (arr) => arr.reduce((m, x) => ((m[x.product_id] ||= []).push(x), m), {});
  const im = by(images), co = by(colors), ca = by(categories);
  return rows.map((r) => ({
    id: r.id, slug: r.slug, name: r.name, subtitle: r.subtitle, description: r.description,
    price: (r.sale_price_cents ?? r.price_cents) / 100, priceCents: r.sale_price_cents ?? r.price_cents,
    regularPrice: r.sale_price_cents != null ? r.price_cents / 100 : null,
    isNew: !!r.is_new, stock: r.stock, personalizable: !!r.personalizable,
    category: r.category_slug, categories: (ca[r.id] || []).map((c) => c.slug), type: r.type_name, collection: r.collection_name,
    images: (im[r.id] || []).map((i) => ({ src: `media/${i.file}`, alt: i.alt || r.name })),
    colors: (co[r.id] || []).map((c) => ({ id: c.id, name: c.name, hex: c.hex })),
    favorite: favs.has(r.id),
  }));
}

const SORTS = {
  featured: 'p.sort_order ASC',
  new: 'p.is_new DESC, p.sort_order ASC',
  price_asc: 'COALESCE(p.sale_price_cents, p.price_cents) ASC, p.sort_order ASC',
  price_desc: 'COALESCE(p.sale_price_cents, p.price_cents) DESC, p.sort_order ASC',
};
const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

function listProducts(q, owner) {
  const where = ['p.active = 1'], args = [];
  if (q.category) {
    where.push('EXISTS (SELECT 1 FROM product_categories pc JOIN categories category_filter ON category_filter.id = pc.category_id WHERE pc.product_id = p.id AND category_filter.slug = ?)');
    args.push(q.category);
  }
  const types = list(q.type);
  if (types.length) { where.push(`t.slug IN (${placeholders(types.length)})`); args.push(...types); }
  const colls = list(q.collection);
  if (colls.length) { where.push(`c.slug IN (${placeholders(colls.length)})`); args.push(...colls); }
  const colors = list(q.color).map((h) => h.toLowerCase());
  if (colors.length) {
    where.push(`EXISTS (SELECT 1 FROM product_colors pc WHERE pc.product_id = p.id AND lower(pc.hex) IN (${placeholders(colors.length)}))`);
    args.push(...colors);
  }
  const sizes = list(q.size);
  if (sizes.length) {
    where.push(`EXISTS (SELECT 1 FROM product_sizes ps JOIN sizes s ON s.id = ps.size_id WHERE ps.product_id = p.id AND s.label IN (${placeholders(sizes.length)}))`);
    args.push(...sizes);
  }
  if (q.sale === '1') where.push('p.sale_price_cents IS NOT NULL');
  for (const flag of ['new', 'bestseller', 'latest']) {
    if (q[flag] === '1') where.push(`p.is_${flag} = 1`);
  }
  for (const token of normalize(q.q).split(/\s+/).filter(Boolean).map(stem)) {
    where.push(`p.search_text LIKE ? ESCAPE '\\'`);
    args.push(`%${token.replace(/[\\%_]/g, '\\$&')}%`);
  }
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 6, 1), 50);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  const order = SORTS[q.sort] || SORTS.featured;
  const from = `FROM products p JOIN categories cat ON cat.id = p.category_id
    LEFT JOIN product_types t ON t.id = p.type_id LEFT JOIN collections c ON c.id = p.collection_id WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) n ${from}`).get(...args).n;
  const rows = db.prepare(`SELECT p.*, t.slug AS type_slug, t.name AS type_name, c.slug AS collection_slug, c.name AS collection_name, cat.slug AS category_slug
    ${from} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, limit, (page - 1) * limit);
  return { items: hydrate(rows, owner), total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

function getProductRow(slug) {
  return db.prepare(`${BASE} WHERE p.slug = ? AND p.active = 1`).get(slug);
}

module.exports = { normalize, refreshSearchText, hydrate, listProducts, getProductRow, BASE };
