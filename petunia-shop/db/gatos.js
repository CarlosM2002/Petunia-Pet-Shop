
const db = require('./index');
const { refreshSearchText } = require('../src/products');
const fs = require('fs');
const path = require('path');

const money = (usd) => Math.round(usd * 100);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const MEDIA_DIR = path.join(__dirname, '..', 'public', 'media');

const GATOS = [
  { slug: 'collar-nyc-gato', name: 'Collar NYC', subtitle: 'collar con charms para gato', price: 30,
    type: 'collares', isNew: 1, best: 1,
    description: 'Collar de cuentas de colores con charms de Nueva York: taxi amarillo, manzana NYC, pretzel y más. Un accesorio lleno de personalidad para tu gato.',
    images: ['gato-nyc-1.jpg'],
    colors: [['Multicolor', '#f2c200']] },
  { slug: 'collar-arcoiris-gato', name: 'Collar arcoíris', subtitle: 'collar con charms y placa', price: 30,
    type: 'collares', isNew: 1, best: 1,
    description: 'Cordón arcoíris con nudos ajustables, cuentas de colores, charms divertidos, inicial con nombre y placa con teléfono. Hecho para lucirse.',
    images: ['gato-arcoiris-collar.jpg'],
    colors: [['Arcoíris', '#ff1fa2']] },
  { slug: 'collar-fiestas-panamenas-gato', name: 'Collar fiestas panameñas', subtitle: 'collar con charms panameños', price: 30,
    type: 'collares', coll: 'fiestas-panamenas',
    description: 'Collar ajustable con cuentas de colores y charms inspirados en Panamá: chiva, bebida de coco, empanada y refresco. Disponible en amarillo y azul.',
    images: ['gato-panama-collar.jpg'],
    colors: [['Amarillo', '#f7e600'], ['Azul', '#2a7ba8']] },
  { slug: 'collar-viajero-gato', name: 'Collar viajero', subtitle: 'collar con charms de viaje', price: 30,
    type: 'collares',
    description: 'Collar de cuentas con charms de viaje: pasaje de avión con nombre, bronceador, hibisco y más. Para el gato que ya tiene las maletas listas.',
    images: ['gato-viajero.jpg'],
    colors: [['Turquesa', '#1aa39a']] },
  { slug: 'collar-wonderland-gato', name: 'Collar Wonderland', subtitle: 'collar con charms de cuento', price: 30,
    type: 'collares',
    description: 'Collar de cuentas lila y verdes con charms de rosas, naipes y detalles de cuento de hadas. Ideal para sesiones de fotos.',
    images: ['gato-wonderland.jpg'],
    colors: [['Lila', '#b89bd8']] },
  { slug: 'collar-gamer-gato', name: 'Collar gamer', subtitle: 'collar con charms y nombre', price: 30,
    type: 'collares',
    description: 'Cordón lila ajustable con cuentas pastel, charms de balón, camioneta y control de videojuegos, inicial con nombre y placa de identificación.',
    images: ['gato-auron-collar.jpg'],
    colors: [['Lila', '#b6a4e8']] },
  { slug: 'collar-escolar-gato', name: 'Collar escolar', subtitle: 'collar con charms escolares', price: 30,
    type: 'collares',
    description: 'Cordón verde neón con cuentas de colores y charms de regreso a clases: manzana con nombre, mochila, lápiz, regla y bus escolar.',
    images: ['gato-escolar-collar.jpg'],
    colors: [['Verde neón', '#b7f58a']] },
  { slug: 'charm-hacha-halloween-gato', name: 'Charm hacha Halloween', subtitle: 'charm de Halloween', price: 15,
    type: 'charms', coll: 'halloween',
    description: 'Charm de hacha con detalle sangriento y etiqueta Halloween, para colgar de cualquier collar. Spooky vibes para tu gato.',
    images: ['gato-hacha-charm.jpg'],
    colors: [] },
  { slug: 'placa-conejita-gato', name: 'Placa conejita rosa', subtitle: 'placa para collar de gato', price: 15,
    type: 'placas',
    description: 'Placa en forma de conejita con lazo azul, en tonos rosa y lila. Se cuelga fácilmente del collar de tu gato.',
    images: ['gato-placa-conejita.jpg'],
    colors: [['Rosa', '#e8416b'], ['Lila', '#a98bd9']] },
  { slug: 'placa-cerveza-gato', name: 'Placa jarra de cerveza', subtitle: 'placa para collar de gato', price: 15,
    type: 'placas',
    description: 'Placa divertida en forma de jarra de cerveza espumosa. Un detalle con humor para el collar de tu gato.',
    images: ['gato-placa-cerveza.jpg'],
    colors: [['Amarillo', '#f2b705']] },
  { slug: 'placa-flor-gato', name: 'Placa flor con nombre', subtitle: 'placa con nombre', price: 15,
    type: 'placas',
    description: 'Placa en forma de flor turquesa con medallón plateado grabado con el nombre de tu gato.',
    images: ['gato-placa-flor.jpg'],
    colors: [['Turquesa', '#2cc5ae']] },
];

/* Versión anterior de este script: productos provisionales que se reemplazan. */
const LEGACY_SLUGS = ['collar-nyc-gato', 'charm-taxi-nyc', 'charm-manzana-nyc',
  'placa-con-nombre-gato', 'panoleta-gato', 'mono-navideno-gato'];

function addGatos() {
  const gatosId = db.prepare("SELECT id FROM categories WHERE slug='gatos'").get()?.id
    ?? db.prepare("INSERT INTO categories (slug,name) VALUES ('gatos','Gatos')").run().lastInsertRowid;
  const unica = db.prepare("SELECT id FROM sizes WHERE label='Talla única'").get()?.id
    ?? db.prepare("INSERT INTO sizes (label,position) VALUES ('Talla única',0)").run().lastInsertRowid;

  const typeId = (slug) => {
    const r = db.prepare('SELECT id FROM product_types WHERE slug=?').get(slug);
    if (r) return r.id;
    return db.prepare('INSERT INTO product_types (slug,name) VALUES (?,?)').run(slug, cap(slug)).lastInsertRowid;
  };
  const collId = (slug) => (slug ? db.prepare('SELECT id FROM collections WHERE slug=?').get(slug)?.id ?? null : null);

  const exists = db.prepare('SELECT 1 FROM products WHERE slug=?');
  const insProd = db.prepare(`INSERT INTO products
    (slug,name,subtitle,description,price_cents,category_id,type_id,collection_id,is_new,is_bestseller,is_latest,sort_order)
    VALUES (@slug,@name,@subtitle,@description,@price,@cat,@type,@coll,@isNew,@best,@latest,@sort)`);
  const insImg = db.prepare('INSERT INTO product_images (product_id,file,alt,position) VALUES (?,?,?,?)');
  const insCol = db.prepare('INSERT INTO product_colors (product_id,name,hex,position) VALUES (?,?,?,?)');
  const insSize = db.prepare('INSERT INTO product_sizes (product_id,size_id) VALUES (?,?)');
  const insSec = db.prepare('INSERT INTO product_sections (product_id,title,body,is_open,position) VALUES (?,?,?,?,?)');

  // Orden después de todo el catálogo actual, para no mezclarse con los perros en la portada.
  const base = db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM products').get().m + 1;
  let added = 0;
  db.transaction(() => {
    const catImages = db.prepare(`SELECT pi.id, pi.file FROM product_images pi
      JOIN products p ON p.id = pi.product_id WHERE p.category_id = ?`).all(gatosId);
    const deleteImage = db.prepare('DELETE FROM product_images WHERE id = ?');
    catImages.forEach((image) => {
      if (!fs.existsSync(path.join(MEDIA_DIR, image.file))) deleteImage.run(image.id);
    });

    const del = db.prepare(`DELETE FROM products WHERE slug = ?
      AND NOT EXISTS (SELECT 1 FROM product_images WHERE product_id = products.id AND file LIKE 'gato-%')`);
    LEGACY_SLUGS.forEach((slug) => del.run(slug));
    GATOS.forEach((p, i) => {
      if (exists.get(p.slug)) return;
      const description = p.description || `${cap(p.subtitle)} de Petunia Pet Shop, un accesorio hecho para tu gato.`;
      const id = insProd.run({ slug: p.slug, name: p.name, subtitle: p.subtitle, description,
        price: money(p.price), cat: gatosId, type: typeId(p.type), coll: collId(p.coll),
        isNew: p.isNew || 0, best: p.best || 0, latest: p.latest || 0, sort: base + i }).lastInsertRowid;
      p.images.forEach((f, k) => insImg.run(id, f, p.name, k));
      p.colors.forEach(([n, h], k) => insCol.run(id, n, h, k));
      insSize.run(id, unica);
      insSec.run(id, 'Descripción', description, 0, 0);
      insSec.run(id, 'Detalles', `${p.name}: ${p.subtitle} de Petunia Pet Shop. Un diseño pensado para acompañar a tu gato.`, 1, 1);
      insSec.run(id, 'Tela y cuidados', 'Consulta con nuestro equipo los materiales y las indicaciones de cuidado de este producto.', 0, 2);
      insSec.run(id, 'Envíos y devoluciones', 'Para conocer los detalles de envío o solicitar ayuda con tu pedido, ponte en contacto con nuestro equipo.', 1, 3);
      refreshSearchText(id);
      added++;
    });
  })();
  return added;
}

module.exports = { addGatos };

if (require.main === module) {
  console.log(`Gatos: ${addGatos()} productos nuevos añadidos.`);
}
