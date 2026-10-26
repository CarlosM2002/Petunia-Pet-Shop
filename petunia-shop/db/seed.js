/* Registros iniciales: todo el contenido que antes estaba escrito a mano en el HTML.
   Uso:  npm run seed   (borra y vuelve a crear los datos del catálogo y del sitio)  */
const crypto = require('crypto');
const db = require('./index');
const { hashPassword } = require('../src/auth');
const { refreshSearchText } = require('../src/products');
const { addGatos } = require('./gatos');
const { applySizes } = require('./tallas');

const money = (usd) => Math.round(usd * 100);
const ins = (sql) => { const s = db.prepare(sql); return (...a) => s.run(...a).lastInsertRowid; };

function reset() {
  const tables = ['search_logs','chat_messages','newsletter_subscribers','reviews','order_items','orders',
    'cart_items','favorites','sessions','product_sections','product_sizes','product_colors','product_images',
    'products','sizes','product_types','collection_tiles','collections','categories','search_suggestions',
    'social_posts','social_links','footer_links','footer_columns','hero_banners','perks','nav_links','site_settings'];
  for (const t of tables) db.exec(`DELETE FROM ${t}`);
}

function seed() {
  db.transaction(() => {
    reset();

    // ── Ajustes generales
    const set = ins('INSERT INTO site_settings (key,value) VALUES (?,?)');
    const settings = {
      brand_name: 'Petunia Pet Shop',
      announcement: '¡Disfruta de nuestra nueva colección Navideña!',
      best_title: 'Más vendidos',
      collection_title: 'Colección Halloween',
      latest_title: 'Últimos modelos',
      about_text_1: 'Somos una empresa especializada en accesorios para mascotas, ubicada en la Ciudad de Panamá desde 2017.',
      about_text_2: 'Todos nuestros productos son aptos para tu fiel compañero.',
      about_cta: 'Conócenos',
      about_image: 'sustainability.jpg',
      social_title: 'Síguenos en @petuniasPetShop',
      newsletter_title: 'Suscríbete para saber de las nuevas colecciones',
      newsletter_consent: 'Al enviar tu correo aceptas recibir emails promocionales de Petunia Pet Shop.',
      copyright: '2017 PetuniaPetShop. All Rights Reserved.',
      chat_greeting: '¡Hola! Cuéntanos qué necesitas y te responderemos pronto.',
      currency: 'USD',
    };
    for (const [k, v] of Object.entries(settings)) set(k, v);

    const nav = ins('INSERT INTO nav_links (label,href,position) VALUES (?,?,?)');
    [['Home','index.html'],['Gatos','gatos.html'],['Perros','perros.html'],['Promociones','#'],['Información','informacion.html']]
      .forEach(([l,h],i) => nav(l,h,i));

    const perk = ins('INSERT INTO perks (text,position) VALUES (?,?)');
    ['Hecho con cariño','Aptos para tu mascota','Desde 2017 en Panamá','Colección navideña'].forEach((t,i) => perk(t,i));

    ins('INSERT INTO hero_banners (image,alt,cta_label,cta_href,position) VALUES (?,?,?,?,0)')(
      'hero.png','Nueva colección navideña de Petunia Pet Shop','New In','#mas-vendidos');

    const col = ins('INSERT INTO footer_columns (title,position) VALUES (?,?)');
    const fl = ins('INSERT INTO footer_links (column_id,label,href,position) VALUES (?,?,?,?)');
    let c = col('¿Necesitas ayuda?', 0);
    fl(c, 'Visita nuestra página de preguntas frecuentes.', 'informacion.html#preguntas', 0);
    c = col('Contáctanos', 1);
    fl(c, 'Síguenos en nuestras redes sociales y entérate de todo lo nuevo.', '#', 0);

    const soc = ins('INSERT INTO social_links (network,url,icon,position) VALUES (?,?,?,?)');
    [['instagram','social-footer.svg'],['facebook','social-facebook.svg'],['pinterest','social-pinterest.svg'],['tiktok','social-tiktok.svg']]
      .forEach(([n,i],p) => soc(n,'#',i,p));

    const post = ins('INSERT INTO social_posts (image,alt,url,featured,position) VALUES (?,?,?,?,?)');
    post('social-feature.jpg','Petunia Pet Shop en Instagram','#',1,0);
    post('social-grid-1.jpg','Mascota con accesorios de Petunia','#',0,1);
    post('social-grid-3.jpg','Productos Petunia para mascotas','#',0,2);
    post('social-grid-2.jpg','Accesorios hechos para mascotas','#',0,3);
    post('social-grid-4.jpg','Mascota usando un accesorio Petunia','#',0,4);

    const sug = ins('INSERT INTO search_suggestions (term,position) VALUES (?,?)');
    ['Collares','Pañoletas','Moños navideños','Placas con nombre','Halloween','Fiestas panameñas'].forEach((t,i) => sug(t,i));

    // ── Catálogo
    const cat = ins('INSERT INTO categories (slug,name,hero_image,hero_alt) VALUES (?,?,?,?)');
    const perros = cat('perros','Perros','dogs-hero.png','Colección canina de Petunia Pet Shop');
    const gatos  = cat('gatos','Gatos','cats-hero.png','Colección felina de Petunia Pet Shop');

    const coll = ins('INSERT INTO collections (slug,name,description) VALUES (?,?,?)');
    const navidena = coll('navidena','Navideña','Accesorios de la colección navideña');
    const halloween = coll('halloween','Halloween','Spooky Vibes: accesorios para Halloween');
    const fiestas = coll('fiestas-panamenas','Fiestas panameñas','Diseños inspirados en las fiestas panameñas');
    const campo = coll('campo','Campo','Colección Campo');

    const tile = ins('INSERT INTO collection_tiles (collection_id,image,alt,badge,position) VALUES (?,?,?,?,?)');
    tile(halloween,'collection-left-top.jpg','Accesorios para mascotas de la colección Spooky Vibes','NEW',0);
    tile(halloween,'collection-left-bottom.jpg','Disfraces y accesorios de Halloween para mascotas','NEW',1);
    tile(halloween,'collection-right-top.jpg','Accesorios coloridos de la colección de Halloween','NEW',2);
    tile(halloween,'collection-right-bottom.jpg','Accesorios de Halloween para perros','NEW',3);

    const type = ins('INSERT INTO product_types (slug,name) VALUES (?,?)');
    const T = { collares: type('collares','Collares'), panoletas: type('panoletas','Pañoletas'),
      monos: type('monos','Moños'), croquetas: type('croquetas','Croquetas'),
      placas: type('placas','Placas'), charms: type('charms','Charms') };

    const size = ins('INSERT INTO sizes (label,position) VALUES (?,?)');
    const unica = size('Talla única', 0);

    const prod = ins(`INSERT INTO products
      (slug,name,subtitle,description,price_cents,category_id,type_id,collection_id,is_new,is_bestseller,is_latest,sort_order)
      VALUES (@slug,@name,@subtitle,@description,@price,@cat,@type,@coll,@isNew,@best,@latest,@sort)`);
    const img = ins('INSERT INTO product_images (product_id,file,alt,position) VALUES (?,?,?,?)');
    const colr = ins('INSERT INTO product_colors (product_id,name,hex,position) VALUES (?,?,?,?)');
    const psize = ins('INSERT INTO product_sizes (product_id,size_id) VALUES (?,?)');
    const sec = ins('INSERT INTO product_sections (product_id,title,body,is_open,position) VALUES (?,?,?,?,?)');

    const P = [
      { slug:'collar-de-campo', name:'collar de campo', subtitle:'collar con charms', price:30, type:T.collares, coll:campo, best:1,
        images:['best-seller-collar.jpg','dogs-product-1-c.jpg'], colors:[['Verde','#0abf4a']] },
      { slug:'placas-con-nombre', name:'placas con nombre', subtitle:'placa con nombre', price:15, type:T.placas, isNew:1, best:1,
        images:['best-seller-placa.jpg'], colors:[['Amarillo','#dfc201'],['Rosa','#f70073'],['Rojo','#d60000']] },
      { slug:'fresa-de-campo', name:'Fresa de campo', subtitle:'placa con nombre', price:15, type:T.placas, coll:campo, best:1,
        images:['best-seller-fresa.jpg'], colors:[['Rojo oscuro','#a40000'],['Rojo suave','#cf5a5e']] },
      { slug:'panoleta-90s', name:'Pañoleta 90s', subtitle:'pañoleta de perrito', price:35, type:T.panoletas, isNew:1,
        images:['dogs-product-1-a.jpg'], colors:[['Naranja','#ce5d17'],['Turquesa','#91d2d0']] },
      { slug:'croquetas-furry-bar', name:'Croquetas furry bar', subtitle:'croquetas de perro', price:25, type:T.croquetas,
        images:['dogs-product-1-b.jpg'], colors:[] },
      { slug:'mono-navideno', name:'moño navideño', subtitle:'moño para perro', price:30, type:T.monos, coll:navidena,
        images:['dogs-product-2-c.jpg'], colors:[['Verde bosque','#0d5430'],['Vino','#800f0f']] },
      { slug:'fiestas-panamenas', name:'Fiestas panameñas', subtitle:'collar para perro', price:30, type:T.collares, coll:fiestas,
        images:['dogs-product-3.jpg'], colors:[['Dorado','#da9d00'],['Azul','#19418e'],['Fucsia','#f51554']] },
      { slug:'panoleta', name:'pañoleta', subtitle:'pañoleta para perro', price:35, type:T.panoletas, coll:fiestas, isNew:1,
        description:'Hermosa pañoleta de perrito con temática para las fiestas panameñas.\nUn accesorio especial para acompañar a tu mascota en cada celebración.',
        detail:'Pañoleta para perro inspirada en las fiestas panameñas. Un diseño colorido y cómodo para acompañar a tu mascota.',
        images:['dogs-product-4.jpg'], colors:[['Azul','#003f92'],['Dorado','#dba249']] },
      // Carrusel "Últimos modelos" (precios provisionales: ajústalos en la base de datos)
      { slug:'cascanueces', name:'cascanueces', subtitle:'charm navideño', price:15, type:T.charms, coll:navidena, latest:1, images:['latest-cascanueces.jpg'], colors:[] },
      { slug:'caballito-navideno', name:'caballito navideño', subtitle:'charm navideño', price:15, type:T.charms, coll:navidena, latest:1, images:['latest-caballito.jpg'], colors:[] },
      { slug:'tambores-navidenos', name:'tambores navideños', subtitle:'charm navideño', price:15, type:T.charms, coll:navidena, latest:1, images:['latest-tambores.jpg'], colors:[] },
      { slug:'rey-raton-cascanueces', name:'rey ratón cascanueces', subtitle:'charm navideño', price:15, type:T.charms, coll:navidena, latest:1, images:['latest-rey-raton.jpg'], colors:[] },
      { slug:'collar-coleccion-navidena', name:'Collar colección navideña', subtitle:'collar con charms', price:30, type:T.collares, coll:navidena, latest:1, images:['latest-collar.jpg'], colors:[] },
    ];

    P.forEach((p, i) => {
      const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
      const id = prod({ slug:p.slug, name:p.name, subtitle:p.subtitle,
        description: p.description || `${cap(p.subtitle)} de Petunia Pet Shop, un accesorio hecho para tu mascota.`,
        price: money(p.price), cat: perros, type: p.type, coll: p.coll || null,
        isNew: p.isNew || 0, best: p.best || 0, latest: p.latest || 0, sort: i });
      p.images.forEach((f, k) => img(id, f, p.name, k));
      p.colors.forEach(([n, h], k) => colr(id, n, h, k));
      psize(id, unica);
      sec(id, 'Descripción', (p.description || cap(p.subtitle) + '.').replace(/\n/g, ' '), 0, 0);
      sec(id, 'Detalles', p.detail || `${cap(p.name)}: ${p.subtitle} de Petunia Pet Shop. Un diseño pensado para acompañar a tu mascota.`, 1, 1);
      sec(id, 'Tela y cuidados', 'Consulta con nuestro equipo los materiales y las indicaciones de cuidado de este producto.', 0, 2);
      sec(id, 'Envíos y devoluciones', 'Para conocer los detalles de envío o solicitar ayuda con tu pedido, ponte en contacto con nuestro equipo.', 1, 3);
    });

    addGatos();
    applySizes();

    db.prepare('SELECT id FROM products').all().forEach((r) => refreshSearchText(r.id));

    // Administrador (solo si se define en el entorno)
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      db.prepare(`INSERT INTO users (name,email,password_hash,role) VALUES ('Administrador',?,?, 'admin')
        ON CONFLICT(email) DO UPDATE SET role='admin', password_hash=excluded.password_hash`)
        .run(process.env.ADMIN_EMAIL, hashPassword(process.env.ADMIN_PASSWORD));
    }
  })();
  require('./migrate')(db);   // restablece textos de ayuda y preguntas frecuentes por defecto
}

function seedIfEmpty() {
  if (db.prepare('SELECT COUNT(*) n FROM products').get().n === 0) seed();
}

module.exports = { seed, seedIfEmpty };

if (require.main === module) {
  seed();
  const n = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
  console.log(`Seed listo: ${n('products')} productos, ${n('product_images')} imágenes, ${n('product_colors')} colores, ${n('collection_tiles')} piezas de colección.`);
}
