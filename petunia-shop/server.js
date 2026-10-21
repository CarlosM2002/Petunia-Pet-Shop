const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const { seedIfEmpty } = require('./db/seed');
seedIfEmpty();
require('./db/gatos').addGatos();
const { identify } = require('./src/auth');
const { renderHeader, renderFooter } = require('./src/layout');

seedIfEmpty();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  });
  next();
});

app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use(identify);

/* ───────── API ───────── */
app.use('/api', (req, res, next) => {
  // Si una escritura trae cuerpo, debe ser JSON (frena formularios enviados desde otros sitios).
  if (!['GET', 'HEAD'].includes(req.method) && Number(req.headers['content-length']) > 0 && !req.is('application/json')) {
    return res.status(415).json({ error: 'Content-Type debe ser application/json.' });
  }
  res.set('Cache-Control', 'no-store');
  next();
});
app.use('/api', require('./src/routes/catalog'));
app.use('/api', require('./src/routes/shop'));
app.use('/api', require('./src/routes/account'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

/* ───────── Páginas (HTML con cabecera y pie generados desde la base de datos) ───────── */
const VIEWS = path.join(__dirname, 'views');
const pageCache = new Map();
function page(name) {
  if (!pageCache.has(name) || process.env.NODE_ENV !== 'production') {
    const file = path.join(VIEWS, name);
    pageCache.set(name, fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
  }
  return pageCache.get(name);
}
const db = require('./db');
db.prepare("UPDATE nav_links SET href = 'informacion.html' WHERE label = 'Información' AND href = '#'").run();
db.prepare(`UPDATE footer_links SET href = 'informacion.html#preguntas'
  WHERE href = '#' AND column_id IN (SELECT id FROM footer_columns WHERE title = '¿Necesitas ayuda?')`).run();

function siteForLayout() {
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  return {
    settings: Object.fromEntries(all('SELECT key, value FROM site_settings').map((r) => [r.key, r.value])),
    nav: all('SELECT label, href FROM nav_links ORDER BY position'),
    footerColumns: all('SELECT id, title FROM footer_columns ORDER BY position').map((c) => ({
      title: c.title, links: all('SELECT label, href FROM footer_links WHERE column_id = ? ORDER BY position', c.id) })),
    social: all('SELECT network, url, icon FROM social_links ORDER BY position'),
  };
}
function sendPage(res, name) {
  const html = page(name);
  if (!html) return res.status(404).send('Página no encontrada');
  const site = siteForLayout();
  res.type('html').send(html
    .replace('<!--@header-->', renderHeader(site, name))
    .replace('<!--@footer-->', renderFooter(site)));
}
app.get('/', (req, res) => sendPage(res, 'index.html'));
app.get(/^\/([a-z0-9-]+\.html)$/, (req, res) => sendPage(res, req.params[0]));

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', index: false }));

app.use((req, res) => res.status(404).type('text').send('No encontrado'));
app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith('/api')) return res.status(500).json({ error: 'Ocurrió un error. Inténtalo de nuevo.' });
  res.status(500).type('text').send('Error del servidor');
});

const PORT = process.env.PORT || 3000;
if (require.main === module) app.listen(PORT, () => console.log(`Petunia Pet Shop en http://localhost:${PORT}`));
module.exports = app;
