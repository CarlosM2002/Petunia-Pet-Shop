/* Página de promociones: ofertas arriba, colecciones abajo. Funciona por sí sola (no depende de la versión de app.js);
   el carrito y los favoritos los maneja app.js con los mismos botones de siempre. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '$' + (Number.isInteger(n) ? n : n.toFixed(2));
  const fdate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'long' });
  const href = (p) => `producto.html?slug=${encodeURIComponent(p.slug)}`;

  const swatches = (colors) => colors.length
    ? `<div class="swatches" aria-label="Colores disponibles">${colors.map((c) => `<span class="swatch" title="${esc(c.name)}" style="--swatch-color: ${esc(c.hex)}"></span>`).join('')}</div>` : '';

  function card(p) {
    const [a, b] = p.images;
    const media = `<a href="${href(p)}" aria-label="Ver ${esc(p.name)}">${a ? `<img src="${esc(a.src)}" alt="${esc(a.alt)}" loading="lazy" />` : ''}${b ? `<img class="alt" src="${esc(b.src)}" alt="" loading="lazy" />` : ''}</a>`;
    return `<article class="card" data-id="${p.id}">
      <div class="card-media">
        ${media}
        ${p.isNew ? '<span class="chip">new</span>' : ''}
        <button class="fav" type="button" data-fav="${p.id}" aria-pressed="${p.favorite}" aria-label="Agregar ${esc(p.name)} a favoritos"><img src="media/favorite.svg" alt="" /></button>
        <button class="quick-add" type="button" data-add="${p.id}" data-name="${esc(p.name)}" ${p.stock < 1 ? 'disabled' : ''}>${p.stock < 1 ? 'Agotado' : 'Agregar a la bolsa'}</button>
      </div>
      <div class="card-body">
        <div>
          <h3 class="card-title"><a href="${href(p)}">${esc(p.name)}</a></h3>
          <p class="card-sub">${esc(p.subtitle)}</p>
          ${p.promotion ? `<p class="sale-promo">-${p.promotion.percent}% · ${esc(p.promotion.name)}${p.promotion.endsAt ? ` · hasta el ${fdate(p.promotion.endsAt)}` : ''}</p>` : ''}
          ${swatches(p.colors)}
        </div>
        <strong class="price">${p.regularPrice ? `<s>${money(p.regularPrice)}</s>` : ''}${money(p.price)}</strong>
      </div>
    </article>`;
  }

  const empty = (msg, link, text) => `<div class="empty"><p>${esc(msg)}</p><a class="btn" href="${link}">${esc(text)}</a></div>`;
  const collUrl = (c) => `coleccion.html?coleccion=${encodeURIComponent(c.slug)}`;

  async function run() {
    const r = await fetch('/api/promotions-page');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();

    $('#sale-grid').innerHTML = d.sale.length ? d.sale.map(card).join('')
      : empty('Por ahora no hay productos en oferta. ¡Vuelve pronto!', 'perros.html', 'Ver la tienda');

    $('#colls-section').hidden = !d.collections.length;
    $('#collections-grid').innerHTML = d.collections.map((c, i) => `<article class="promo-collection" id="coleccion-${esc(c.slug)}" style="--accent: var(${i % 2 ? '--sun' : '--purple'})">
      <a class="promo-collection-media" href="${collUrl(c)}" aria-label="Ver ${esc(c.name)}">${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy" />` : ''}</a>
      <div class="promo-collection-body"><h3>${esc(c.name)}</h3>${c.description ? `<p>${esc(c.description)}</p>` : ''}
        <div class="promo-links"><a class="btn btn-light" href="${collUrl(c)}">Ver colección (${c.productCount})</a></div></div></article>`).join('');
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }

  run().catch((e) => {
    console.error(e);
    $('#sale-grid').innerHTML = empty('No pudimos cargar las promociones. Recarga la página e inténtalo de nuevo.', 'promociones.html', 'Recargar');
  });
})();
