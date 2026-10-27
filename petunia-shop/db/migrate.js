/* Migraciones ligeras e idempotentes. Se ejecutan cada vez que se abre la base de datos
   (db/index.js), así tu petunia.db actual se actualiza sola sin perder datos. */

const INFO_DEFAULTS = {
  info_eyebrow: 'Hecho con cariño, desde 2017',
  info_title: 'Un poquito más sobre Petunia',
  info_intro: 'Somos Petunia Pet Shop, una tienda panameña especializada en accesorios para mascotas. Creamos una selección alegre y especial para acompañar a esos compañeros que hacen nuestros días mejores.',
  info_story_title: 'Una tienda con mucho amor por los animales',
  info_story_p1: 'Petunia Pet Shop nació en Ciudad de Panamá en 2017 con una idea sencilla: encontrar accesorios que celebren la personalidad de cada mascota y la conexión que compartimos con ella.',
  info_story_p2: 'Por eso reunimos diseños, colores y colecciones para hacer más especiales los paseos, las fotos y todos esos momentos cotidianos junto a tu mejor amigo.',
  info_note_title: 'Pequeños detalles, grandes momentos',
  info_note_text: 'Explora nuestros accesorios para perros y gatos, descubre tus favoritos y revisa los detalles de cada producto para elegir el que mejor se adapte a tu mascota.',
  info_faq_title: 'Preguntas frecuentes',
  info_faq_intro: 'Encuentra aquí respuestas útiles antes de elegir tus favoritos. Si necesitas una mano, también puedes escribirnos por el chat.',
  info_cta_title: '¿Listos para encontrar su próximo favorito?',
};

const PROMO_DEFAULTS = {
  promo_title: 'Promociones',
  promo_intro: 'Aprovecha nuestras ofertas y descubre las colecciones de Petunia.',
  promo_sale_title: 'En oferta',
  promo_collections_title: 'Colecciones',
};

const FAQ_DEFAULTS = [
  ['¿Qué es Petunia Pet Shop?', 'Somos una tienda de Ciudad de Panamá especializada en accesorios para mascotas. Estamos aquí desde 2017 ofreciendo productos y colecciones para hacer más especiales sus días.'],
  ['¿Qué tipo de productos puedo encontrar?', 'Tenemos accesorios como collares, pañoletas, moños, placas y otros detalles de nuestras colecciones. La disponibilidad puede variar; revisa cada ficha para ver sus opciones, precio y existencias actuales.'],
  ['¿Cómo hago un pedido?', 'Explora el catálogo, agrega a tu bolsa los productos disponibles y continúa al formulario del pedido. Al recibirlo, nos pondremos en contacto contigo para coordinar los siguientes pasos.'],
  ['¿Cómo se coordinan el pago y la entrega?', 'El pedido queda registrado y nuestro equipo coordina contigo el pago y la entrega. Los detalles se confirman directamente después de realizar el pedido, así que no se realiza un cobro automático en la tienda.'],
  ['¿Los accesorios sirven para cualquier mascota?', 'Depende del producto y de las características de tu mascota. Antes de comprar, consulta las opciones y la información de su ficha. Si tienes dudas sobre el ajuste o el uso, escríbenos y te orientamos.'],
  ['¿Puedo pedir una placa con nombre?', 'En el catálogo encontrarás placas con nombre cuando estén disponibles. Revisa la ficha del producto para conocer sus opciones y, si necesitas confirmar cómo personalizarla, consúltanos por el chat antes de hacer el pedido.'],
  ['¿Qué hago si tengo una pregunta sobre mi pedido?', 'Abre el chat desde el botón de esta página y cuéntanos qué necesitas. Si ya hiciste un pedido, comparte la información que te permita identificarlo para que podamos ayudarte mejor.'],
];

module.exports = function migrate(db) {
  const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);

  if (!cols('products').includes('sale_price_cents'))
    db.exec('ALTER TABLE products ADD COLUMN sale_price_cents INTEGER');          // precio con promoción (calculado)
  if (!cols('collections').includes('image')) db.exec('ALTER TABLE collections ADD COLUMN image TEXT');   // portada de la colección (opcional)
  if (!cols('collections').includes('position')) {
    db.exec('ALTER TABLE collections ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
    db.exec('UPDATE collections SET position = id');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS product_categories (
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      PRIMARY KEY (product_id, category_id)
    );
    CREATE INDEX IF NOT EXISTS idx_product_categories_category ON product_categories(category_id, product_id);
    INSERT OR IGNORE INTO product_categories (product_id, category_id)
      SELECT id, category_id FROM products;
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS promotions (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      percent    INTEGER NOT NULL CHECK (percent BETWEEN 1 AND 90),
      scope      TEXT NOT NULL DEFAULT 'products' CHECK (scope IN ('all','category','collection','products')),
      scope_ref  TEXT,                              -- slug de categoría o colección
      starts_at  TEXT,                              -- YYYY-MM-DD (opcional)
      ends_at    TEXT,                              -- YYYY-MM-DD (opcional, inclusive)
      active     INTEGER NOT NULL DEFAULT 1,
      position   INTEGER NOT NULL DEFAULT 0,        -- prioridad: la primera que aplique gana
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS promotion_products (
      promotion_id INTEGER NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
      product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      PRIMARY KEY (promotion_id, product_id)
    );
    CREATE TABLE IF NOT EXISTS faqs (
      id       INTEGER PRIMARY KEY,
      question TEXT NOT NULL,
      answer   TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );
  `);

  db.prepare("UPDATE nav_links SET href = 'promociones.html' WHERE href = '#' AND label LIKE 'Promocion%'").run();

  const setting = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries({ ...INFO_DEFAULTS, ...PROMO_DEFAULTS })) setting.run(k, v);

  if (db.prepare('SELECT COUNT(*) n FROM faqs').get().n === 0) {
    const ins = db.prepare('INSERT INTO faqs (question, answer, position) VALUES (?, ?, ?)');
    FAQ_DEFAULTS.forEach(([q, a], i) => ins.run(q, a, i + 1));
  }
};
module.exports.INFO_KEYS = Object.keys(INFO_DEFAULTS);
module.exports.PROMO_KEYS = Object.keys(PROMO_DEFAULTS);
