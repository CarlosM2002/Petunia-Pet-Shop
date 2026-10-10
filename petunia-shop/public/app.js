(() => {
  'use strict';

  /* ───────── Utilidades ───────── */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '$' + (Number.isInteger(n) ? n : n.toFixed(2));
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch('/api' + path, {
      method,
      headers: method !== 'GET' ? { 'Content-Type': 'application/json' } : undefined,
      body: method !== 'GET' ? JSON.stringify(body || {}) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'Ocurrió un error. Inténtalo de nuevo.'), { status: res.status });
    return data;
  }

  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.setAttribute('role', 'status');
  document.body.appendChild(toastEl);
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  /* ───────── Estado global (sesión y contadores) ───────── */
  const state = { user: null, cart: { items: [], count: 0, subtotal: 0 }, favCount: 0 };

  function setCount(el, n) {
    if (!el) return;
    el.hidden = !n;
    el.textContent = n;
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }
  const renderCounts = () => { setCount($('#bag-count'), state.cart.count); setCount($('#fav-count'), state.favCount); };

  async function loadState() {
    const s = await api('/state');
    state.user = s.user; state.cart.count = s.cartCount; state.favCount = s.favCount;
    renderCounts();
  }

  /* ───────── Plantillas de producto ───────── */
  const swatches = (colors) => colors.length
    ? `<div class="swatches" aria-label="Colores disponibles">${colors.map((c) => `<span class="swatch" title="${esc(c.name)}" style="--swatch-color: ${esc(c.hex)}"></span>`).join('')}</div>` : '';
  const href = (p) => `producto.html?slug=${encodeURIComponent(p.slug)}`;

  function cardHTML(p) {
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
          ${swatches(p.colors)}
        </div>
        <strong class="price">${money(p.price)}</strong>
      </div>
    </article>`;
  }

  function latestHTML(p) {
    const a = p.images[0];
    return `<article class="latest-card" data-id="${p.id}">
      <div class="card-media">
        <a href="${href(p)}" aria-label="Ver ${esc(p.name)}">${a ? `<img src="${esc(a.src)}" alt="${esc(a.alt)}" loading="lazy" />` : ''}</a>
        <button class="fav" type="button" data-fav="${p.id}" aria-pressed="${p.favorite}" aria-label="Agregar ${esc(p.name)} a favoritos"><img src="media/favorite.svg" alt="" /></button>
      </div>
      <h3><a href="${href(p)}">${esc(p.name)}</a></h3>
    </article>`;
  }

  const emptyHTML = (msg, linkHref = 'index.html', linkText = 'Volver al inicio') =>
    `<div class="empty"><p>${esc(msg)}</p><a class="btn" href="${linkHref}">${esc(linkText)}</a></div>`;

  /* ───────── Páginas ───────── */
  async function homePage() {
    const d = await api('/home');
    const s = d.settings;
    if (d.hero) $('#hero').innerHTML = `<img src="media/${esc(d.hero.image)}" alt="${esc(d.hero.alt)}" />${d.hero.ctaLabel ? `<a class="btn hero-cta" href="${esc(d.hero.ctaHref)}">${esc(d.hero.ctaLabel)}</a>` : ''}`;
    $('#perks').innerHTML = `<ul>${d.perks.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
    $('#best-title').textContent = s.best_title;
    $('#best-grid').innerHTML = d.bestsellers.map(cardHTML).join('');
    $('#hall-title').textContent = s.collection_title;
    const cls = ['t-a', 't-b', 't-c', 't-d'];
    const tile = (t, i) => `<a class="collection-tile ${cls[i % 4]}" href="perros.html?coleccion=halloween" aria-label="Explorar colección Halloween"><img src="media/${esc(t.image)}" alt="${esc(t.alt)}" loading="lazy" />${t.badge ? `<span class="chip">${esc(t.badge)}</span>` : ''}</a>`;
    const tiles = d.collectionTiles.map(tile);
    $('#tiles').innerHTML = `<div class="collection-column">${tiles.slice(0, 2).join('')}</div><div class="collection-column">${tiles.slice(2, 4).join('')}</div>`;
    $('#latest-title').textContent = s.latest_title;
    $('#latest').innerHTML = d.latest.map(latestHTML).join('');
    $('#about').innerHTML = `<img class="about-bg" src="media/${esc(s.about_image)}" alt="" loading="lazy" />
      <div class="about-card"><strong>${esc(s.about_text_1)}</strong><p>${esc(s.about_text_2)}</p><a class="btn" href="#">${esc(s.about_cta)}</a></div>`;
    $('#social-title').textContent = s.social_title;
    const item = (p) => `<a class="social-item${p.featured ? ' social-feature' : ''}" href="${esc(p.url)}" aria-label="Ver publicación en Instagram"><img src="media/${esc(p.image)}" alt="${esc(p.alt)}" loading="lazy" /></a>`;
    const feat = d.socialPosts.find((p) => p.featured);
    $('#social').innerHTML = `${feat ? item(feat) : ''}<div class="social-small-grid">${d.socialPosts.filter((p) => !p.featured).map(item).join('')}</div>`;

    const track = $('#latest');
    $$('[data-scroll]').forEach((b) => b.addEventListener('click', () => {
      const w = (track.firstElementChild?.getBoundingClientRect().width || 288) + 24;
      track.scrollBy({ left: w * Number(b.dataset.scroll), behavior: 'smooth' });
    }));
  }

  /* Catálogo con filtros reales (perros, gatos…) */
  async function catalogPage() {
    const slug = document.body.dataset.category;
    const cat = await api(`/categories/${slug}`);
    if (cat.heroImage) {
      const hero = $('#cat-hero');
      hero.hidden = false;
      hero.innerHTML = `<img src="media/${esc(cat.heroImage)}" alt="${esc(cat.heroAlt)}" />`;
    }
    const f = cat.filters;
    const url = new URLSearchParams(location.search);
    const sel = {
      sort: url.get('orden') || 'featured',
      type: new Set((url.get('tipo') || '').split(',').filter(Boolean)),
      size: new Set((url.get('talla') || '').split(',').filter(Boolean)),
      color: new Set((url.get('color') || '').split(',').filter(Boolean)),
      collection: new Set((url.get('coleccion') || '').split(',').filter(Boolean)),
    };
    const chev = '<img src="media/dogs-filter-expand.svg" alt="" />';
    const group = (title, key, body, open) => `<details class="filter" ${open ? 'open' : ''}><summary>${title}${chev}</summary>${body}</details>`;
    const checks = (key, rows) => `<div class="filter-options">${rows.map(([v, l]) => `<label><input type="checkbox" data-filter="${key}" value="${esc(v)}" ${sel[key].has(v) ? 'checked' : ''} /> ${esc(l)}</label>`).join('')}</div>`;
    let html = group('Ordenar por', 'sort', `<div class="filter-options">${f.sorts.map((s) => `<label><input type="radio" name="sort" data-filter="sort" value="${s.value}" ${sel.sort === s.value ? 'checked' : ''} /> ${esc(s.label)}</label>`).join('')}</div>`, sel.sort !== 'featured');
    if (f.types.length) html += group('Producto', 'type', checks('type', f.types.map((t) => [t.slug, t.name])), sel.type.size);
    if (f.sizes.length) html += group('Talla', 'size', checks('size', f.sizes.map((s) => [s, s])), sel.size.size);
    if (f.colors.length) html += group('Color', 'color', `<div class="filter-dots">${f.colors.map((c) => `<button type="button" data-filter="color" value="${esc(c.hex)}" title="${esc(c.name)}" aria-label="Color ${esc(c.name)}" aria-pressed="${sel.color.has(c.hex)}" style="--swatch-color: ${esc(c.hex)}"></button>`).join('')}</div>`, sel.color.size);
    if (f.collections.length) html += group('Colección', 'collection', checks('collection', f.collections.map((c) => [c.slug, c.name])), sel.collection.size);
    $('#filter-list').innerHTML = html;
    $('#filter-list').style.display = 'grid'; $('#filter-list').style.gap = '12px';

    const grid = $('#catalog-grid'), more = $('#load-more'), count = $('#result-count');
    let page = 1, pages = 1;
    const query = (p) => {
      const q = new URLSearchParams({ category: slug, page: p, limit: 6, sort: sel.sort });
      for (const k of ['type', 'size', 'color', 'collection']) if (sel[k].size) q.set(k, [...sel[k]].join(','));
      return q;
    };
    const syncUrl = () => {
      const q = new URLSearchParams();
      if (sel.sort !== 'featured') q.set('orden', sel.sort);
      for (const [k, name] of [['type', 'tipo'], ['size', 'talla'], ['color', 'color'], ['collection', 'coleccion']]) if (sel[k].size) q.set(name, [...sel[k]].join(','));
      history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
    };
    async function load(reset) {
      if (reset) { page = 1; grid.innerHTML = ''; }
      const r = await api('/products?' + query(page));
      pages = r.pages;
      grid.insertAdjacentHTML('beforeend', r.items.map(cardHTML).join(''));
      count.textContent = r.total ? `${r.total} ${r.total === 1 ? 'producto' : 'productos'}` : '';
      if (!r.total) grid.innerHTML = `<div style="grid-column:1/-1">${emptyHTML(slug === 'gatos' && !sel.type.size ? 'Pronto tendremos accesorios para gatos.' : 'No encontramos productos con esos filtros.', location.pathname, 'Quitar filtros')}</div>`;
      more.hidden = page >= pages;
    }
    $('#filter-list').addEventListener('change', (e) => {
      const el = e.target.closest('[data-filter]'); if (!el) return;
      if (el.dataset.filter === 'sort') sel.sort = el.value;
      else el.checked ? sel[el.dataset.filter].add(el.value) : sel[el.dataset.filter].delete(el.value);
      syncUrl(); load(true);
    });
    $('#filter-list').addEventListener('click', (e) => {
      const el = e.target.closest('button[data-filter="color"]'); if (!el) return;
      const on = el.getAttribute('aria-pressed') !== 'true';
      el.setAttribute('aria-pressed', on);
      on ? sel.color.add(el.value) : sel.color.delete(el.value);
      syncUrl(); load(true);
    });
    $('button', more).addEventListener('click', () => { page += 1; load(false); });
    await load(true);
  }

  /* Detalle de producto */
  async function productPage() {
    const slug = new URLSearchParams(location.search).get('slug');
    let p;
    try { p = await api(`/products/${encodeURIComponent(slug || '')}`); }
    catch { $('#product-detail').innerHTML = emptyHTML('No encontramos este producto.', 'perros.html', 'Ver productos'); $('#opiniones').hidden = true; return; }
    document.title = `${cap(p.name)} | Petunia Pet Shop`;
    $('#product-crumbs').innerHTML = `<a href="index.html">Home</a><span class="sep" aria-hidden="true">/</span><a href="${p.category}.html">${esc(p.categoryName)}</a><span class="sep" aria-hidden="true">/</span><span aria-current="page">${esc(cap(p.name))}</span>`;

    const imgs = p.images;
    const thumbs = imgs.length > 1 ? `<div class="thumbs">${imgs.map((i, k) => `<button class="thumb" type="button" data-src="${esc(i.src)}" ${k === 0 ? 'aria-current="true"' : ''} aria-label="Ver foto ${k + 1}"><img src="${esc(i.src)}" alt="" /></button>`).join('')}</div>` : '';
    const colors = p.colors.length ? `<div><h2>Colores</h2><div class="color-swatches">${p.colors.map((c, k) => `<button type="button" data-color="${c.id}" aria-pressed="${k === 0}" aria-label="Color ${esc(c.name)}" title="${esc(c.name)}" style="--swatch-color: ${esc(c.hex)}"></button>`).join('')}</div></div>` : '';
    const sizes = p.sizes.length ? `<div class="size-row"><label for="product-size">Talla</label><select id="product-size">${p.sizes.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join('')}</select></div>` : '';
    const r = p.rating;
    const stars = r.count ? `<span class="stars" aria-label="${r.average} de 5 estrellas">${'★'.repeat(Math.round(r.average))}${'☆'.repeat(5 - Math.round(r.average))}</span><a href="#opiniones">${r.count} ${r.count === 1 ? 'opinión' : 'opiniones'}</a>`
      : `<span class="stars" aria-hidden="true">☆☆☆☆☆</span><a href="#opiniones">Sé el primero en opinar</a>`;
    const desc = (p.description || '').split('\n').map((t) => `<p>${esc(t)}</p>`).join('');
    $('#product-detail').innerHTML = `
      <section class="gallery${imgs.length > 1 ? '' : ' single'}" aria-label="Imágenes de ${esc(p.name)}">
        ${thumbs}
        <div class="gallery-main"><img src="${esc(imgs[0]?.src || '')}" alt="${esc(imgs[0]?.alt || p.name)}" /></div>
      </section>
      <section class="buy" aria-labelledby="product-title">
        <h1 id="product-title">${esc(p.name)}</h1>
        <strong class="big-price">${money(p.price)}</strong>
        <p class="lead">${esc(p.subtitle ? cap(p.subtitle) + '.' : '')}</p>
        ${colors}${sizes}
        <button class="btn" type="button" id="add-btn" ${p.stock < 1 ? 'disabled' : ''}>${p.stock < 1 ? 'Agotado' : `Agregar a la bolsa · ${money(p.price)}`}</button>
        <div class="reviews">${stars}</div>
        <div class="desc"><h2>Descripción del producto</h2>${desc}</div>
      </section>
      <section class="accordions" aria-label="Información del producto">
        ${p.sections.map((s) => `<details class="accordion" ${s.open ? 'open' : ''}><summary>${esc(s.title)}</summary><p>${esc(s.body)}</p></details>`).join('')}
      </section>`;

    const main = $('.gallery-main img');
    $$('.thumb').forEach((t) => t.addEventListener('click', () => {
      $$('.thumb').forEach((x) => x.removeAttribute('aria-current'));
      t.setAttribute('aria-current', 'true');
      main.src = t.dataset.src;
    }));
    const box = $('.gallery-main');
    box.addEventListener('mousemove', (e) => {
      const b = box.getBoundingClientRect();
      main.style.setProperty('--zx', ((e.clientX - b.left) / b.width) * 100 + '%');
      main.style.setProperty('--zy', ((e.clientY - b.top) / b.height) * 100 + '%');
    });
    let colorId = p.colors[0]?.id || null;
    $$('.color-swatches button').forEach((b) => b.addEventListener('click', () => {
      $$('.color-swatches button').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      colorId = Number(b.dataset.color);
    }));
    $('#add-btn').addEventListener('click', () => addToCart(p.id, p.name, { colorId, sizeId: Number($('#product-size')?.value) || null }));

    // Opiniones
    renderReviews(p);

    if (p.related.length) { $('#related').hidden = false; $('#related-grid').innerHTML = p.related.map(cardHTML).join(''); }
  }

  async function renderReviews(p) {
    const root = $('#opiniones');
    const list = await api(`/products/${encodeURIComponent(p.slug)}/reviews`);
    const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
    const form = state.user
      ? `<form class="review-form" id="review-form">
           <h3>Deja tu opinión</h3>
           <div class="star-input" role="radiogroup" aria-label="Calificación">${[5, 4, 3, 2, 1].map((n) => `<input type="radio" name="rating" id="r${n}" value="${n}" ${n === 5 ? 'checked' : ''} /><label for="r${n}" title="${n} ${n === 1 ? 'estrella' : 'estrellas'}">★</label>`).join('')}</div>
           <textarea name="body" rows="3" maxlength="1000" placeholder="Cuéntanos cómo le quedó a tu mascota" required></textarea>
           <p class="form-error" role="alert" hidden></p>
           <button class="btn" type="submit">Publicar opinión</button>
         </form>`
      : `<p class="review-login">Para opinar, <button class="link-btn" type="button" data-open="account">inicia sesión o crea tu cuenta</button>.</p>`;
    root.innerHTML = `<div class="section-head"><h2 class="section-title" id="reviews-title">Opiniones</h2></div>
      <div class="review-grid">
        <div class="review-list">${list.length ? list.map((r) => `<article class="review"><div class="stars" aria-label="${r.rating} de 5">${stars(r.rating)}</div><p>${esc(r.body)}</p><small>${esc(r.author)} · ${new Date(r.createdAt).toLocaleDateString('es')}</small></article>`).join('') : '<p class="muted">Todavía no hay opiniones para este producto.</p>'}</div>
        ${form}
      </div>`;
    const f = $('#review-form');
    if (f) f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('.form-error', f); err.hidden = true;
      try {
        await api(`/products/${encodeURIComponent(p.slug)}/reviews`, { method: 'POST', body: { rating: f.rating.value, body: f.body.value } });
        toast('¡Gracias por tu opinión!');
        const fresh = await api(`/products/${encodeURIComponent(p.slug)}`);
        $('.reviews').innerHTML = `<span class="stars">${'★'.repeat(Math.round(fresh.rating.average))}${'☆'.repeat(5 - Math.round(fresh.rating.average))}</span><a href="#opiniones">${fresh.rating.count} ${fresh.rating.count === 1 ? 'opinión' : 'opiniones'}</a>`;
        renderReviews(p);
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    });
  }

  /* Buscador */
  async function searchPage() {
    const input = $('#search-input'), results = $('#search-results'), grid = $('#search-grid'), count = $('#search-count');
    const popular = await api('/search/popular');
    $('#popular').innerHTML = popular.map((t) => `<a href="search.html?q=${encodeURIComponent(t)}" data-term="${esc(t)}">${esc(t)}</a>`).join('');
    let timer, seq = 0;
    async function run(q) {
      q = q.trim();
      const mine = ++seq;
      if (!q) { results.hidden = true; return; }
      const r = await api('/products?' + new URLSearchParams({ q, limit: 24 }));
      if (mine !== seq) return;
      results.hidden = false;
      count.textContent = r.total ? `${r.total} ${r.total === 1 ? 'resultado' : 'resultados'} para “${q}”` : '';
      grid.innerHTML = r.total ? r.items.map(cardHTML).join('') : `<div style="grid-column:1/-1">${emptyHTML(`No encontramos resultados para “${q}”. Prueba con otra palabra.`, 'perros.html', 'Ver todos los productos')}</div>`;
      history.replaceState(null, '', '?q=' + encodeURIComponent(q));
    }
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => run(input.value), 250); });
    $('#search-form').addEventListener('submit', (e) => { e.preventDefault(); run(input.value); });
    $('#popular').addEventListener('click', (e) => {
      const a = e.target.closest('a[data-term]'); if (!a) return;
      e.preventDefault(); input.value = a.dataset.term; run(a.dataset.term);
    });
    const q = new URLSearchParams(location.search).get('q');
    if (q) { input.value = q; run(q); }
  }

  /* ───────── Acciones compartidas: favoritos y bolsa ───────── */
  async function toggleFav(id) {
    const r = await api(`/favorites/${id}/toggle`, { method: 'POST' });
    state.favCount = r.count; renderCounts();
    $$(`[data-fav="${id}"]`).forEach((b) => b.setAttribute('aria-pressed', r.favorite));
    toast(r.favorite ? 'Guardado en favoritos' : 'Quitado de favoritos');
    if (openPanel === 'favorites') renderFavorites();
  }

  async function addToCart(id, name, opts = {}) {
    try {
      const cart = await api('/cart', { method: 'POST', body: { productId: id, qty: 1, ...opts } });
      state.cart = cart; renderCounts();
      toast(`${cap(name)} agregado a la bolsa`);
      if (openPanel === 'cart') renderCart();
    } catch (e) { toast(e.message); }
  }

  document.addEventListener('click', (e) => {
    const fav = e.target.closest('[data-fav]');
    if (fav) { e.preventDefault(); toggleFav(fav.dataset.fav).catch((x) => toast(x.message)); return; }
    const add = e.target.closest('[data-add]');
    if (add) { e.preventDefault(); addToCart(Number(add.dataset.add), add.dataset.name); return; }
    const open = e.target.closest('[data-open]');
    if (open) { e.preventDefault(); openOverlay(open.dataset.open); }
  });

  /* ───────── Paneles: bolsa, favoritos, cuenta y chat ───────── */
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.hidden = true;
  overlay.innerHTML = '<div class="overlay-backdrop" data-close></div><aside class="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title"><header class="panel-head"><h2 id="panel-title"></h2><button class="round-btn" type="button" data-close aria-label="Cerrar">&times;</button></header><div class="panel-body"></div></aside>';
  document.body.appendChild(overlay);
  const panel = $('.panel', overlay), body = $('.panel-body', overlay), titleEl = $('#panel-title');
  let openPanel = null, lastFocus = null, chatTimer = null;

  function openOverlay(name) {
    lastFocus = document.activeElement;
    openPanel = name;
    panel.dataset.kind = name;
    overlay.hidden = false;
    document.body.classList.add('no-scroll');
    ({ cart: renderCart, favorites: renderFavorites, account: renderAccount, chat: renderChat }[name])();
    requestAnimationFrame(() => { overlay.classList.add('open'); (panel.querySelector('input, textarea, button:not([data-close])') || $('[data-close]', panel)).focus({ preventScroll: true }); });
  }
  function closeOverlay() {
    if (!openPanel) return;
    overlay.classList.remove('open');
    clearInterval(chatTimer);
    openPanel = null;
    document.body.classList.remove('no-scroll');
    setTimeout(() => { if (!openPanel) overlay.hidden = true; }, 250);
    lastFocus?.focus?.();
  }
  overlay.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeOverlay(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeOverlay();
    if (e.key === 'Tab' && openPanel) {
      const f = $$('button, input, textarea, select, a[href]', panel).filter((x) => !x.disabled && x.offsetParent);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  $('#btn-cart')?.addEventListener('click', () => openOverlay('cart'));
  $('#btn-favorites')?.addEventListener('click', () => openOverlay('favorites'));
  $('#btn-account')?.addEventListener('click', () => openOverlay('account'));
  $('#btn-chat')?.addEventListener('click', () => openOverlay('chat'));

  /* Bolsa + pago */
  async function renderCart() {
    titleEl.textContent = 'Tu bolsa';
    const cart = await api('/cart');
    state.cart = cart; renderCounts();
    if (openPanel !== 'cart') return;
    if (!cart.items.length) { body.innerHTML = emptyHTML('Tu bolsa está vacía.', 'perros.html', 'Ver productos'); return; }
    body.innerHTML = `<ul class="cart-list">${cart.items.map((i) => `
      <li class="cart-item" data-item="${i.id}">
        <a href="producto.html?slug=${encodeURIComponent(i.slug)}"><img src="${esc(i.image)}" alt="" /></a>
        <div class="cart-info">
          <a class="cart-name" href="producto.html?slug=${encodeURIComponent(i.slug)}">${esc(cap(i.name))}</a>
          <small>${i.color ? `<span class="dot" style="--swatch-color:${esc(i.color.hex)}"></span>${esc(i.color.name)}` : ''}${i.color && i.size ? ' · ' : ''}${esc(i.size || '')}</small>
          <div class="qty" role="group" aria-label="Cantidad">
            <button type="button" data-qty="${i.qty - 1}" aria-label="Quitar uno">−</button><span>${i.qty}</span><button type="button" data-qty="${i.qty + 1}" aria-label="Agregar uno">+</button>
          </div>
        </div>
        <div class="cart-side"><strong>${money(i.lineTotal)}</strong><button class="link-btn" type="button" data-remove>Quitar</button></div>
      </li>`).join('')}</ul>
      <div class="cart-foot"><div class="subtotal"><span>Subtotal</span><strong>${money(cart.subtotal)}</strong></div>
      <button class="btn" type="button" id="go-checkout">Finalizar compra</button></div>`;
  }

  function renderCheckout() {
    titleEl.textContent = 'Finalizar compra';
    const u = state.user || {};
    body.innerHTML = `<form class="stack" id="checkout-form">
      <label class="field">Nombre<input name="name" required maxlength="100" value="${esc(u.name || '')}" autocomplete="name" /></label>
      <label class="field">Correo electrónico<input name="email" type="email" required value="${esc(u.email || '')}" autocomplete="email" /></label>
      <label class="field">Teléfono<input name="phone" type="tel" maxlength="40" autocomplete="tel" /></label>
      <label class="field">Dirección de entrega<textarea name="address" rows="3" required maxlength="300" autocomplete="street-address"></textarea></label>
      <label class="field">Notas (opcional)<textarea name="notes" rows="2" maxlength="500"></textarea></label>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn" type="submit">Confirmar pedido · ${money(state.cart.subtotal)}</button>
      <button class="link-btn" type="button" id="back-cart">Volver a la bolsa</button></form>`;
  }

  body.addEventListener('click', async (e) => {
    const item = e.target.closest('[data-item]');
    try {
      if (e.target.closest('[data-qty]') && item) {
        const qty = Number(e.target.closest('[data-qty]').dataset.qty);
        state.cart = qty < 1 ? await api(`/cart/${item.dataset.item}`, { method: 'DELETE' }) : await api(`/cart/${item.dataset.item}`, { method: 'PATCH', body: { qty } });
        renderCounts(); renderCart();
      } else if (e.target.closest('[data-remove]') && item) {
        state.cart = await api(`/cart/${item.dataset.item}`, { method: 'DELETE' }); renderCounts(); renderCart();
      } else if (e.target.id === 'go-checkout') renderCheckout();
      else if (e.target.id === 'back-cart') renderCart();
      else if (e.target.closest('[data-fav-remove]')) { await toggleFav(e.target.closest('[data-fav-remove]').dataset.favRemove); }
      else if (e.target.closest('[data-fav-add]')) { const b = e.target.closest('[data-fav-add]'); await addToCart(Number(b.dataset.favAdd), b.dataset.name); }
      else if (e.target.closest('[data-tab]')) renderAccount(e.target.closest('[data-tab]').dataset.tab);
      else if (e.target.id === 'logout') { await api('/auth/logout', { method: 'POST' }); state.user = null; await loadState(); toast('Sesión cerrada'); closeOverlay(); if (document.body.dataset.page === 'product') location.reload(); }
    } catch (ex) { toast(ex.message); }
  });

  body.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, err = $('.form-error', f), data = Object.fromEntries(new FormData(f));
    if (err) err.hidden = true;
    try {
      if (f.id === 'checkout-form') {
        const o = await api('/orders', { method: 'POST', body: data });
        state.cart = { items: [], count: 0, subtotal: 0 }; renderCounts();
        titleEl.textContent = '¡Pedido recibido!';
        body.innerHTML = `<div class="order-done"><p>Gracias, ${esc(data.name)}. Tu pedido <strong>${esc(o.code)}</strong> por <strong>${money(o.total)}</strong> quedó registrado.</p><p class="muted">Te contactaremos a ${esc(data.email)} para coordinar el pago y la entrega.</p><button class="btn" type="button" data-close>Seguir comprando</button></div>`;
      } else if (f.id === 'login-form' || f.id === 'register-form') {
        const r = await api(f.id === 'login-form' ? '/auth/login' : '/auth/register', { method: 'POST', body: data });
        state.user = r.user; await loadState(); toast(`¡Hola, ${r.user.name}!`);
        if (document.body.dataset.page === 'product') { closeOverlay(); setTimeout(() => location.reload(), 150); } else renderAccount();
      } else if (f.id === 'chat-form') {
        const msgs = await api('/chat', { method: 'POST', body: { body: data.body } });
        f.reset(); drawChat(msgs);
      }
    } catch (ex) { if (err) { err.textContent = ex.message; err.hidden = false; } else toast(ex.message); }
  });

  /* Favoritos */
  async function renderFavorites() {
    titleEl.textContent = 'Tus favoritos';
    const items = await api('/favorites');
    state.favCount = items.length; renderCounts();
    if (openPanel !== 'favorites') return;
    body.innerHTML = items.length ? `<ul class="cart-list">${items.map((p) => `
      <li class="cart-item"><a href="${href(p)}"><img src="${esc(p.images[0]?.src)}" alt="" /></a>
      <div class="cart-info"><a class="cart-name" href="${href(p)}">${esc(cap(p.name))}</a><small>${esc(p.subtitle)}</small><button class="btn btn-small" type="button" data-fav-add="${p.id}" data-name="${esc(p.name)}">Agregar a la bolsa</button></div>
      <div class="cart-side"><strong>${money(p.price)}</strong><button class="link-btn" type="button" data-fav-remove="${p.id}">Quitar</button></div></li>`).join('')}</ul>`
      : emptyHTML('Aún no tienes favoritos. Toca el corazón en los productos que te gusten.', 'perros.html', 'Ver productos');
  }

  /* Cuenta */
  async function renderAccount(tab = 'login') {
    if (state.user) {
      titleEl.textContent = `Hola, ${state.user.name}`;
      body.innerHTML = '<p class="muted">Cargando pedidos…</p>';
      const orders = await api('/orders').catch(() => []);
      if (openPanel !== 'account') return;
      body.innerHTML = `<p class="muted">${esc(state.user.email)}</p><h3 class="panel-sub">Mis pedidos</h3>
        ${orders.length ? orders.map((o) => `<article class="order-card"><header><strong>${esc(o.code)}</strong><span class="status status-${o.status}">${{ pending: 'Pendiente', paid: 'Pagado', shipped: 'Enviado', delivered: 'Entregado', cancelled: 'Cancelado' }[o.status]}</span></header>
          <ul>${o.items.map((i) => `<li>${i.qty} × ${esc(cap(i.name))}${i.color ? ` (${esc(i.color)})` : ''}</li>`).join('')}</ul><footer>${new Date(o.createdAt).toLocaleDateString('es')} · ${money(o.total)}</footer></article>`).join('') : '<p class="muted">Todavía no has hecho pedidos.</p>'}
        <button class="btn btn-light" type="button" id="logout">Cerrar sesión</button>`;
      return;
    }
    titleEl.textContent = tab === 'login' ? 'Ingresar' : 'Crear cuenta';
    body.innerHTML = `<div class="tabs" role="tablist"><button type="button" role="tab" data-tab="login" aria-selected="${tab === 'login'}">Ingresar</button><button type="button" role="tab" data-tab="register" aria-selected="${tab !== 'login'}">Crear cuenta</button></div>
      ${tab === 'login' ? `<form class="stack" id="login-form">
        <label class="field">Correo electrónico<input name="email" type="email" required autocomplete="email" /></label>
        <label class="field">Contraseña<input name="password" type="password" required autocomplete="current-password" /></label>
        <p class="form-error" role="alert" hidden></p><button class="btn" type="submit">Ingresar</button></form>`
      : `<form class="stack" id="register-form">
        <label class="field">Nombre<input name="name" required maxlength="80" autocomplete="name" /></label>
        <label class="field">Correo electrónico<input name="email" type="email" required autocomplete="email" /></label>
        <label class="field">Contraseña (mínimo 8 caracteres)<input name="password" type="password" required minlength="8" autocomplete="new-password" /></label>
        <p class="form-error" role="alert" hidden></p><button class="btn" type="submit">Crear cuenta</button></form>`}
      <p class="muted small">Tu bolsa y tus favoritos se guardan en tu cuenta.</p>`;
  }

  /* Chat */
  let chatGreeting = '';
  function drawChat(msgs, greeting = chatGreeting) {
    chatGreeting = greeting;
    const box = $('.chat-log', body);
    if (!box) return;
    box.innerHTML = `${greeting ? `<div class="msg agent">${esc(greeting)}</div>` : ''}${msgs.map((m) => `<div class="msg ${m.sender}">${esc(m.body)}</div>`).join('')}`;
    box.scrollTop = box.scrollHeight;
  }
  async function renderChat() {
    titleEl.textContent = 'Chat con Petunia';
    body.innerHTML = '<div class="chat-log" aria-live="polite"></div><form class="chat-form" id="chat-form"><input name="body" maxlength="1000" placeholder="Escribe tu mensaje" required autocomplete="off" aria-label="Mensaje" /><button class="btn btn-small" type="submit">Enviar</button></form><p class="form-error" role="alert" hidden></p>';
    const load = async () => { const c = await api('/chat'); if (openPanel === 'chat') drawChat(c.messages, c.greeting); };
    await load();
    chatTimer = setInterval(load, 15000);
  }

  /* ───────── Newsletter ───────── */
  $('#newsletter-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      const r = await api('/newsletter', { method: 'POST', body: { email: f.email.value, consent: $('input[name="consent"]').checked } });
      toast(r.message); f.reset(); $('input[name="consent"]').checked = false;
    } catch (ex) { toast(ex.message); }
  });

  /* ───────── Arranque ───────── */
  const pages = { home: homePage, catalog: catalogPage, product: productPage, search: searchPage };
  (async () => {
    await loadState().catch(() => {});
    const run = pages[document.body.dataset.page];
    if (run) await run().catch((e) => { console.error(e); toast('No pudimos cargar la página. Recárgala e inténtalo de nuevo.'); });
  })();
})();
