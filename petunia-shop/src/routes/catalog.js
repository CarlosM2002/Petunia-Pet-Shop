const express = require('express');
const db = require('../../db');
const { hydrate, listProducts, getProductRow, normalize } = require('../products');

const router = express.Router();
const all = (sql, ...a) => db.prepare(sql).all(...a);

/* Contenido común a todas las páginas (cabecera, pie, ajustes). */
function siteData() {
  const settings = Object.fromEntries(all('SELECT key, value FROM site_settings').map((r) => [r.key, r.value]));
  const columns = all('SELECT id, title FROM footer_columns ORDER BY position').map((c) => ({
    title: c.title, links: all('SELECT label, href FROM footer_links WHERE column_id = ? ORDER BY position', c.id),
  }));
  return {
    settings,
    nav: all('SELECT label, href FROM nav_links ORDER BY position'),
    footerColumns: columns,
    social: all('SELECT network, url, icon FROM social_links ORDER BY position'),
  };
}
router.get('/site', (req, res) => res.json({ ...siteData(), user: req.user && { name: req.user.name, email: req.user.email, role: req.user.role } }));

/* Estado del visitante: sesión y contadores de la cabecera. */
router.get('/state', (req, res) => {
  const { col, val } = req.owner;
  res.json({
    user: req.user && { name: req.user.name, email: req.user.email, role: req.user.role },
    cartCount: db.prepare(`SELECT COALESCE(SUM(qty),0) n FROM cart_items WHERE ${col} = ?`).get(val).n,
    favCount: db.prepare(`SELECT COUNT(*) n FROM favorites WHERE ${col} = ?`).get(val).n,
  });
});

router.get('/home', (req, res) => {
  const owner = req.owner;
  const featured = (flag, limit) => hydrate(db.prepare(
    `SELECT p.*, t.slug AS type_slug, t.name AS type_name, c.slug AS collection_slug, c.name AS collection_name, cat.slug AS category_slug
     FROM products p JOIN categories cat ON cat.id = p.category_id LEFT JOIN product_types t ON t.id = p.type_id
     LEFT JOIN collections c ON c.id = p.collection_id WHERE p.active = 1 AND p.${flag} = 1 ORDER BY p.sort_order LIMIT ?`).all(limit), owner);
  const hall = db.prepare("SELECT id FROM collections WHERE slug = 'halloween'").get();
  res.json({
    settings: siteData().settings,
    hero: db.prepare('SELECT image, alt, cta_label AS ctaLabel, cta_href AS ctaHref FROM hero_banners WHERE active = 1 ORDER BY position LIMIT 1').get(),
    perks: all('SELECT text FROM perks ORDER BY position').map((p) => p.text),
    bestsellers: featured('is_bestseller', 6),
    collectionTiles: hall ? all('SELECT image, alt, badge FROM collection_tiles WHERE collection_id = ? ORDER BY position', hall.id) : [],
    latest: featured('is_latest', 12),
    socialPosts: all('SELECT image, alt, url, featured FROM social_posts ORDER BY position'),
  });
});

/* Categoría + opciones de filtro disponibles (solo las que existen en el catálogo). */
router.get('/categories/:slug', (req, res) => {
  const cat = db.prepare('SELECT id, slug, name, hero_image AS heroImage, hero_alt AS heroAlt FROM categories WHERE slug = ?').get(req.params.slug);
  if (!cat) return res.status(404).json({ error: 'Categoría no encontrada.' });
  const scope = 'p.active = 1 AND p.category_id = ?';
  res.json({
    ...cat,
    filters: {
      types: all(`SELECT t.slug, t.name FROM product_types t WHERE EXISTS (SELECT 1 FROM products p WHERE p.type_id = t.id AND ${scope}) ORDER BY t.name`, cat.id),
      sizes: all(`SELECT s.label FROM sizes s WHERE EXISTS (SELECT 1 FROM product_sizes ps JOIN products p ON p.id = ps.product_id WHERE ps.size_id = s.id AND ${scope}) ORDER BY s.position`, cat.id).map((s) => s.label),
      colors: all(`SELECT lower(pc.hex) AS hex, MIN(pc.name) AS name FROM product_colors pc JOIN products p ON p.id = pc.product_id WHERE ${scope} GROUP BY lower(pc.hex) ORDER BY MIN(pc.id)`, cat.id),
      collections: all(`SELECT c.slug, c.name FROM collections c WHERE EXISTS (SELECT 1 FROM products p WHERE p.collection_id = c.id AND ${scope}) ORDER BY c.position, c.id`, cat.id),
      sorts: [{ value: 'featured', label: 'Destacados' }, { value: 'new', label: 'Más nuevos' },
        { value: 'price_asc', label: 'Precio: menor a mayor' }, { value: 'price_desc', label: 'Precio: mayor a menor' }],
    },
  });
});

router.get('/products', (req, res) => {
  const result = listProducts(req.query, req.owner);
  const term = normalize(req.query.q);
  if (term && (parseInt(req.query.page, 10) || 1) === 1) {
    db.prepare('INSERT INTO search_logs (term, results) VALUES (?, ?)').run(term.slice(0, 80), result.total);
  }
  res.json(result);
});

router.get('/search/popular', (req, res) =>
  res.json(all('SELECT term FROM search_suggestions ORDER BY position').map((r) => r.term)));

router.get('/search/suggest', (req, res) => {
  const { items } = listProducts({ q: req.query.q, limit: 5 }, req.owner);
  res.json(items.map((p) => ({ slug: p.slug, name: p.name, price: p.price, image: p.images[0]?.src })));
});

router.get('/products/:slug', (req, res) => {
  const row = getProductRow(req.params.slug);
  if (!row) return res.status(404).json({ error: 'Producto no encontrado.' });
  const [product] = hydrate([row], req.owner);
  const rating = db.prepare('SELECT COUNT(*) AS count, AVG(rating) AS average FROM reviews WHERE product_id = ?').get(row.id);
  const related = db.prepare(`${require('../products').BASE} WHERE p.active = 1 AND p.id != ? AND p.category_id = ?
    ORDER BY (p.collection_id IS ? ) DESC, p.sort_order LIMIT 3`).all(row.id, row.category_id, row.collection_id);
  res.json({
    ...product,
    categoryName: db.prepare('SELECT name FROM categories WHERE id = ?').get(row.category_id).name,
    sizes: all('SELECT s.id, s.label FROM product_sizes ps JOIN sizes s ON s.id = ps.size_id WHERE ps.product_id = ? ORDER BY s.position', row.id),
    sections: all('SELECT title, body, is_open AS open FROM product_sections WHERE product_id = ? ORDER BY position', row.id).map((s) => ({ ...s, open: !!s.open })),
    rating: { count: rating.count, average: rating.average ? Math.round(rating.average * 10) / 10 : null },
    related: hydrate(related, req.owner),
  });
});

router.get('/products/:slug/reviews', (req, res) => {
  const row = getProductRow(req.params.slug);
  if (!row) return res.status(404).json({ error: 'Producto no encontrado.' });
  res.json(all(`SELECT r.id, r.rating, r.body, r.created_at AS createdAt, u.name AS author
    FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.product_id = ? ORDER BY r.id DESC LIMIT 50`, row.id));
});

module.exports = router;
