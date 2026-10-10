# Petunia Pet Shop — tienda con backend

Node.js + Express + SQLite. Las páginas se ven igual que el diseño HTML/CSS, pero ahora todo el contenido
sale de la base de datos y las acciones (favoritos, bolsa, pedidos, cuenta, búsqueda…) funcionan de verdad.

## Cómo correrlo

```bash
npm install
npm start            # http://localhost:3000
```

La primera vez, el servidor crea `db/petunia.db` y carga los registros iniciales (`db/seed.js`).
`npm run seed` borra y vuelve a cargar el catálogo y el contenido del sitio (no borra usuarios ni pedidos).
Para crear un administrador: copia `.env.example` a `.env`, define `ADMIN_EMAIL` y `ADMIN_PASSWORD`
y corre `ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run seed`.

## Estructura

```
server.js            Express: seguridad básica, API y páginas
db/schema.sql        Esquema de la base de datos
db/seed.js           Registros iniciales (lo que antes estaba escrito en el HTML)
src/auth.js          Contraseñas (scrypt), sesiones, visitante anónimo, límite de intentos
src/products.js      Listado, filtros y búsqueda
src/routes/          catalog · shop (favoritos, bolsa, pedidos) · account (auth, reseñas, newsletter, chat) · admin
src/layout.js        Cabecera y pie generados desde la base de datos
views/*.html         Páginas (index, perros, gatos, producto, search)
public/              styles.css, app.js (frontend) y media/
```

## Base de datos

| Grupo | Tablas |
|---|---|
| Contenido del sitio | `site_settings`, `nav_links`, `perks`, `hero_banners`, `footer_columns`, `footer_links`, `social_links`, `social_posts`, `search_suggestions` |
| Catálogo | `categories`, `collections`, `collection_tiles`, `product_types`, `sizes`, `products`, `product_images`, `product_colors`, `product_sizes`, `product_sections` |
| Clientes | `users`, `sessions`, `favorites`, `cart_items` |
| Pedidos | `orders`, `order_items` (guardan nombre y precio al momento de comprar) |
| Interacción | `reviews`, `newsletter_subscribers`, `chat_messages`, `search_logs` |

- Precios en centavos (`price_cents`). Moneda: USD.
- Favoritos y bolsa pertenecen a un usuario **o** a un visitante anónimo (cookie `pid`); al iniciar sesión o registrarse se fusionan con la cuenta.
- La primera imagen de `product_images` es la principal y la segunda aparece al pasar el cursor.
- `products.search_text` guarda el texto sin tildes para el buscador ("panoleta" encuentra "pañoleta").

## API (todas bajo `/api`)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/state` | sesión y contadores de la cabecera |
| GET | `/home` | portada, más vendidos, colección, últimos modelos, redes |
| GET | `/categories/:slug` | categoría y opciones de filtro disponibles |
| GET | `/products?category&type&color&collection&size&sort&q&page&limit` | listado, filtros, orden, búsqueda y paginación |
| GET | `/products/:slug` | detalle, secciones, valoración y relacionados |
| GET/POST | `/products/:slug/reviews` | opiniones (publicar requiere sesión) |
| GET | `/search/popular` · `/search/suggest?q=` | búsquedas populares y sugerencias |
| GET | `/favorites` · POST `/favorites/:id/toggle` | favoritos |
| GET/POST | `/cart` · PATCH/DELETE `/cart/:id` | bolsa (valida color, talla y stock) |
| POST | `/orders` · GET `/orders` | confirmar pedido (descuenta stock) · mis pedidos |
| POST | `/auth/register` · `/auth/login` · `/auth/logout` · GET `/auth/me` | cuenta |
| POST | `/newsletter` | suscripción (exige la casilla de consentimiento) |
| GET/POST | `/chat` | chat del visitante |
| — | `/admin/*` | solo rol `admin`: pedidos, suscriptores, chats, búsquedas y CRUD de productos |

Ejemplo (crear producto como admin):

```bash
curl -b cookies -X POST localhost:3000/api/admin/products -H 'Content-Type: application/json' \
  -d '{"name":"Collar nuevo","price":22.5,"category":"perros","type":"collares","images":["dogs-product-3.jpg"]}'
```

## Seguridad incluida

Contraseñas con scrypt, sesiones con token aleatorio guardado como hash, cookies `HttpOnly` + `SameSite=Lax`,
consultas SQL parametrizadas, escape de HTML en el frontend, cabeceras (CSP, nosniff, frame-ancestors),
límite de intentos en login, registro, newsletter, pedidos y chat, y precios siempre tomados de la base de datos
(nunca del navegador).

## Pendiente / decisiones a revisar

- **Precios provisionales:** los 5 modelos de "Últimos modelos" no tenían precio en el diseño; quedaron en $15 (charms) y $30 (collar). Ajusta `price_cents` en la base de datos o con la API de admin.
- **Textos genéricos:** "Detalles" y "Tela y cuidados" de los productos (excepto la pañoleta) son texto provisional.
- **Colección Halloween:** las 4 imágenes son piezas de la colección; todavía no hay productos Halloween, así que "Explorar" muestra el estado vacío.
- **Gatos:** la categoría existe pero no tiene productos ni imagen de portada.
- **Pago:** el pedido queda registrado como `pending` y el equipo coordina pago y entrega; no hay pasarela de pago ni envío de correos.
- **Imágenes:** pesan ~20 MB en total; conviene comprimirlas antes de publicar.
- Para producción: `NODE_ENV=production` (cookies `secure`, detrás de HTTPS), y respaldar `db/petunia.db`.
