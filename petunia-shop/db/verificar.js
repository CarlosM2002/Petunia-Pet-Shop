/* Revisa que los archivos del panel y de Promociones estén en su sitio y que el servidor responda.
   Uso (desde la carpeta principal del proyecto):  node db/verificar.js */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return null; } };

const CHECKS = [
  ['server.js', 'recomputeSales', 'server.js'],
  ['db/index.js', "require('./migrate')", 'db/index.js'],
  ['db/migrate.js', 'PROMO_KEYS', 'db/migrate.js'],
  ['src/promotions.js', 'recomputeSales', 'src/promotions.js'],
  ['src/layout.js', 'fillTokens', 'src/layout.js'],
  ['src/products.js', 'regularPrice', 'src/products.js'],
  ['src/routes/shop.js', 'sale_price_cents', 'src/routes/shop.js'],
  ['src/routes/catalog.js', 'promotions-page', 'src/routes/catalog.js'],
  ['src/routes/admin.js', 'promo-page', 'src/routes/admin.js'],
  ['views/promociones.html', 'promociones.js', 'views/promociones.html'],
  ['views/admin.html', 'admin-panel.js', 'views/admin.html'],
  ['public/promociones.js', 'promotions-page', 'public/promociones.js'],
  ['public/admin-panel.js', 'promo-page', 'public/admin-panel.js'],
  ['public/admin.css', '--grape', 'public/admin.css'],
];

let problems = 0;
for (const [file, needle, copy] of CHECKS) {
  const txt = read(file);
  if (txt === null) { console.log(`FALTA        ${file}  → cópialo a esa carpeta`); problems++; }
  else if (!txt.includes(needle)) { console.log(`DESACTUALIZADO ${file}  → reemplázalo por la versión nueva`); problems++; }
  else console.log(`ok           ${file}`);
}

(async () => {
  try {
    const app = require('../server');
    const srv = app.listen(0);
    const base = `http://127.0.0.1:${srv.address().port}`;
    for (const url of ['/promociones.html', '/api/promotions-page', '/admin.html']) {
      const r = await fetch(base + url);
      const bad = r.status !== 200;
      if (bad) problems++;
      console.log(`${bad ? 'ERROR' : 'ok   '}        GET ${url} → ${r.status}`);
    }
    srv.close();
  } catch (e) { problems++; console.log('ERROR al arrancar el servidor:', e.message); }
  console.log(problems ? `\n${problems} problema(s). Corrige los de arriba y reinicia el servidor.` : '\nTodo en orden. Reinicia el servidor (npm start) y recarga con Ctrl+Shift+R.');
  process.exit(0);
})();
