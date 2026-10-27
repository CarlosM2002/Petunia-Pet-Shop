-- Petunia Pet Shop · esquema de base de datos (SQLite)
-- Dinero en centavos (INTEGER). Fechas en ISO-8601 (UTC).

PRAGMA foreign_keys = ON;

-- ───────────── Contenido del sitio ─────────────
CREATE TABLE IF NOT EXISTS site_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nav_links (
  id       INTEGER PRIMARY KEY,
  label    TEXT NOT NULL,
  href     TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS perks (            -- franja amarilla de beneficios
  id       INTEGER PRIMARY KEY,
  text     TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS hero_banners (     -- portada de inicio
  id       INTEGER PRIMARY KEY,
  image    TEXT NOT NULL,
  alt      TEXT NOT NULL,
  cta_label TEXT,
  cta_href  TEXT,
  active   INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS footer_columns (
  id       INTEGER PRIMARY KEY,
  title    TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS footer_links (
  id        INTEGER PRIMARY KEY,
  column_id INTEGER NOT NULL REFERENCES footer_columns(id) ON DELETE CASCADE,
  label     TEXT NOT NULL,
  href      TEXT NOT NULL DEFAULT '#',
  position  INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS social_links (
  id       INTEGER PRIMARY KEY,
  network  TEXT NOT NULL,                     -- instagram | facebook | pinterest | tiktok
  url      TEXT NOT NULL,
  icon     TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS social_posts (     -- mosaico "Síguenos en @petuniasPetShop"
  id       INTEGER PRIMARY KEY,
  image    TEXT NOT NULL,
  alt      TEXT NOT NULL,
  url      TEXT NOT NULL DEFAULT '#',
  featured INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS search_suggestions (  -- chips "Búsquedas populares"
  id       INTEGER PRIMARY KEY,
  term     TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

-- ───────────── Catálogo ─────────────
CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,            -- perros | gatos
  name       TEXT NOT NULL,
  hero_image TEXT,
  hero_alt   TEXT
);

CREATE TABLE IF NOT EXISTS collections (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS collection_tiles ( -- imágenes de "Colección Halloween"
  id            INTEGER PRIMARY KEY,
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  image         TEXT NOT NULL,
  alt           TEXT NOT NULL,
  badge         TEXT,
  position      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_types (    -- Collares, Pañoletas, Moños…
  id   INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sizes (
  id       INTEGER PRIMARY KEY,
  label    TEXT NOT NULL UNIQUE,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id            INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  subtitle      TEXT,
  description   TEXT,
  price_cents   INTEGER NOT NULL CHECK (price_cents >= 0),
  category_id   INTEGER NOT NULL REFERENCES categories(id),
  type_id       INTEGER REFERENCES product_types(id),
  collection_id INTEGER REFERENCES collections(id),
  is_new        INTEGER NOT NULL DEFAULT 0,
  is_bestseller INTEGER NOT NULL DEFAULT 0,
  is_latest     INTEGER NOT NULL DEFAULT 0,    -- carrusel "Últimos modelos"
  stock         INTEGER NOT NULL DEFAULT 100 CHECK (stock >= 0),
  active        INTEGER NOT NULL DEFAULT 1,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  search_text   TEXT NOT NULL DEFAULT '',      -- texto normalizado (sin tildes) para el buscador
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id, active, sort_order);
CREATE TABLE IF NOT EXISTS product_categories (
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_product_categories_category ON product_categories(category_id, product_id);

CREATE TABLE IF NOT EXISTS product_images (   -- la 1ª es la principal; la 2ª aparece en hover
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  file       TEXT NOT NULL,
  alt        TEXT,
  position   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_images_product ON product_images(product_id, position);

CREATE TABLE IF NOT EXISTS product_colors (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  hex        TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_colors_product ON product_colors(product_id);

CREATE TABLE IF NOT EXISTS product_sizes (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size_id    INTEGER NOT NULL REFERENCES sizes(id),
  PRIMARY KEY (product_id, size_id)
);

CREATE TABLE IF NOT EXISTS product_sections ( -- acordeones: Detalles, Envíos…
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  is_open    INTEGER NOT NULL DEFAULT 0,
  position   INTEGER NOT NULL DEFAULT 0
);

-- ───────────── Clientes ─────────────
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,                 -- SHA-256 del token de la cookie
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

-- Favoritos y bolsa pertenecen a un usuario o a un visitante anónimo (cookie).
CREATE TABLE IF NOT EXISTS favorites (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  visitor_id TEXT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK ((user_id IS NOT NULL) <> (visitor_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fav_user    ON favorites(user_id, product_id)    WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fav_visitor ON favorites(visitor_id, product_id) WHERE visitor_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS cart_items (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  visitor_id TEXT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color_id   INTEGER REFERENCES product_colors(id) ON DELETE SET NULL,
  size_id    INTEGER REFERENCES sizes(id),
  qty        INTEGER NOT NULL DEFAULT 1 CHECK (qty BETWEEN 1 AND 99),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK ((user_id IS NOT NULL) <> (visitor_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_cart_user    ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_visitor ON cart_items(visitor_id);

-- ───────────── Pedidos ─────────────
CREATE TABLE IF NOT EXISTS orders (
  id             INTEGER PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,         -- ej. PET-4F7K2Q
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_name  TEXT NOT NULL,
  email          TEXT NOT NULL,
  phone          TEXT,
  address        TEXT NOT NULL,
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','paid','shipped','delivered','cancelled')),
  subtotal_cents INTEGER NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS order_items (       -- copia de nombre/precio al momento de comprar
  id               INTEGER PRIMARY KEY,
  order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  color_name       TEXT,
  size_label       TEXT,
  unit_price_cents INTEGER NOT NULL,
  qty              INTEGER NOT NULL CHECK (qty > 0)
);

-- ───────────── Interacción ─────────────
CREATE TABLE IF NOT EXISTS reviews (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (product_id, user_id)
);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id         INTEGER PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  consent    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         INTEGER PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sender     TEXT NOT NULL CHECK (sender IN ('customer','agent')),
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_visitor ON chat_messages(visitor_id, id);

CREATE TABLE IF NOT EXISTS search_logs (
  id         INTEGER PRIMARY KEY,
  term       TEXT NOT NULL,
  results    INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
