(() => {
  'use strict';

  /* ───────── Utilidades ───────── */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '$' + (Number.isInteger(n) ? n : n.toFixed(2));
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
  const INPUT_RULES = {
    name: { pattern: /^[\p{L}\p{M} .'\u2019-]*$/u, message: 'Usa letras, espacios, apóstrofos, puntos o guiones.' },
    email: { pattern: /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~@-]*$/, message: 'El correo no debe llevar espacios ni caracteres no válidos.' },
    phone: { pattern: /^[0-9+() .-]*$/, message: 'Usa números y los símbolos + ( ) - .' },
  };
  let feedbackId = 0;
  document.addEventListener('input', (event) => {
    const input = event.target.closest('[data-validate]');
    const rule = input && INPUT_RULES[input.dataset.validate];
    if (!rule) return;
    let feedback = input.nextElementSibling;
    if (!feedback?.classList.contains('input-feedback')) {
      feedback = document.createElement('small');
      feedback.className = 'input-feedback';
      feedback.id = `input-feedback-${++feedbackId}`;
      feedback.setAttribute('aria-live', 'polite');
      input.after(feedback);
      input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), feedback.id].filter(Boolean).join(' '));
    }
    const invalid = !rule.pattern.test(input.value);
    input.setCustomValidity(invalid ? rule.message : '');
    input.setAttribute('aria-invalid', String(invalid));
    feedback.textContent = invalid ? rule.message : '';
    feedback.hidden = !invalid;
  });
  const instagramUrl = 'https://www.instagram.com/petuniaspetshop?utm_source=ig_web_button_share_sheet&xtok=ZDNlZDc0MzIxNw==';

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
        <strong class="price">${p.regularPrice ? `<s>${money(p.regularPrice)}</s>` : ''}${money(p.price)}</strong>
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
    const tile = (t, i) => `<a class="collection-tile ${cls[i % 4]}" href="coleccion.html?coleccion=halloween" aria-label="Explorar colección Halloween"><img src="media/${esc(t.image)}" alt="${esc(t.alt)}" loading="lazy" />${t.badge ? `<span class="chip">${esc(t.badge)}</span>` : ''}</a>`;
    const tiles = d.collectionTiles.map(tile);
    $('#tiles').innerHTML = `<div class="collection-column">${tiles.slice(0, 2).join('')}</div><div class="collection-column">${tiles.slice(2, 4).join('')}</div>`;
    $('#latest-title').textContent = s.latest_title;
    $('#latest').innerHTML = d.latest.map(latestHTML).join('');
    $('#about').innerHTML = `<img class="about-bg" src="media/${esc(s.about_image)}" alt="" loading="lazy" />
      <div class="about-card"><strong>${esc(s.about_text_1)}</strong><p>${esc(s.about_text_2)}</p><a class="btn" href="informacion.html">${esc(s.about_cta)}</a></div>`;
    $('#social-title').textContent = s.social_title;
    const item = (p) => `<a class="social-item${p.featured ? ' social-feature' : ''}" href="${esc(instagramUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Ver publicación en Instagram"><img src="media/${esc(p.image)}" alt="${esc(p.alt)}" loading="lazy" /></a>`;
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
    const url = new URLSearchParams(location.search);
    const collectionSlug = slug === 'all' ? url.get('coleccion') : null;
    const cat = collectionSlug ? await api(`/collections/${encodeURIComponent(collectionSlug)}`) : await api(`/categories/${slug}`);
    if (slug === 'all') {
      document.title = `${cat.name} | Petunia Pet Shop`;
      $('#catalog-crumb').textContent = cat.name;
      $('#collection-title').textContent = cat.name;
    }
    if (cat.heroImage) {
      const hero = $('#cat-hero');
      hero.hidden = false;
      hero.innerHTML = `<img src="media/${esc(cat.heroImage)}" alt="${esc(cat.heroAlt)}" />`;
    }
    const f = cat.filters;
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
    if (slug !== 'all' && f.collections.length) html += group('Colección', 'collection', checks('collection', f.collections.map((c) => [c.slug, c.name])), sel.collection.size);
    $('#filter-list').innerHTML = html;
    $('#filter-list').style.display = 'grid'; $('#filter-list').style.gap = '12px';

    const grid = $('#catalog-grid'), more = $('#load-more'), count = $('#result-count');
    let page = 1, pages = 1;
    const query = (p) => {
      const q = new URLSearchParams({ page: p, limit: 6, sort: sel.sort });
      if (slug !== 'all') q.set('category', slug);
      else q.set('collection', collectionSlug);
      for (const k of ['type', 'size', 'color', 'collection']) if (slug !== 'all' && sel[k].size) q.set(k, [...sel[k]].join(','));
      return q;
    };
    const syncUrl = () => {
      const q = new URLSearchParams();
      if (slug === 'all') q.set('coleccion', collectionSlug);
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
      if (!r.total) grid.innerHTML = `<div style="grid-column:1/-1">${emptyHTML(slug === 'gatos' && !sel.type.size ? 'Pronto tendremos accesorios para gatos.' : `No encontramos productos ${collectionSlug ? `en ${esc(cat.name)}` : 'con esos filtros'}.`, location.pathname, 'Quitar filtros')}</div>`;
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
    const plateOn = !!(p.personalizable && p.colors.length);   // producto con nombre grabado
    const showThumbs = imgs.length > 1 || plateOn;
    const plateThumb = plateOn ? '<button class="thumb thumb-plate" type="button" data-plate aria-label="Ver tu placa personalizada"><span class="plate-thumb" id="plate-thumb"></span></button>' : '';
    const thumbs = showThumbs ? `<div class="thumbs">${imgs.map((i, k) => `<button class="thumb" type="button" data-src="${esc(i.src)}" ${k === 0 ? 'aria-current="true"' : ''} aria-label="Ver foto ${k + 1}"><img src="${esc(i.src)}" alt="" /></button>`).join('')}${plateThumb}</div>` : '';
    const colors = p.colors.length ? `<div><h2>Colores</h2><div class="color-swatches">${p.colors.map((c, k) => `<button type="button" data-color="${c.id}" aria-pressed="${k === 0}" aria-label="Color ${esc(c.name)}" title="${esc(c.name)}" style="--swatch-color: ${esc(c.hex)}"></button>`).join('')}</div></div>` : '';
    const sizes = p.sizes.length ? `<div class="size-row"><label for="product-size">Talla</label><select id="product-size">${p.sizes.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join('')}</select></div>` : '';
    const r = p.rating;
    const stars = r.count ? `<span class="stars" aria-label="${r.average} de 5 estrellas">${'★'.repeat(Math.round(r.average))}${'☆'.repeat(5 - Math.round(r.average))}</span><a href="#opiniones">${r.count} ${r.count === 1 ? 'opinión' : 'opiniones'}</a>`
      : `<span class="stars" aria-hidden="true">☆☆☆☆☆</span><a href="#opiniones">Sé el primero en opinar</a>`;
    const desc = (p.description || '').split('\n').map((t) => `<p>${esc(t)}</p>`).join('');
    $('#product-detail').innerHTML = `
      <section class="gallery${showThumbs ? '' : ' single'}" aria-label="Imágenes de ${esc(p.name)}">
        ${thumbs}
        <div class="gallery-main"><img src="${esc(imgs[0]?.src || '')}" alt="${esc(imgs[0]?.alt || p.name)}" />${plateOn ? '<div class="plate-main" id="plate-main" hidden></div>' : ''}</div>
      </section>
      <section class="buy" aria-labelledby="product-title">
        <h1 id="product-title">${esc(p.name)}</h1>
        <strong class="big-price">${p.regularPrice ? `<s>${money(p.regularPrice)}</s>` : ''}${money(p.price)}</strong>
        <p class="lead">${esc(p.subtitle ? cap(p.subtitle) + '.' : '')}</p>
        ${colors}${sizes}
        ${plateOn ? '<button class="btn btn-custom" type="button" id="custom-btn" aria-haspopup="dialog">✎ Personalizar placa</button><p class="plate-summary" id="plate-summary" hidden></p>' : ''}
        <button class="btn" type="button" id="add-btn" ${p.stock < 1 ? 'disabled' : ''}>${p.stock < 1 ? 'Agotado' : `Agregar a la bolsa · ${money(p.price)}`}</button>
        <div class="reviews">${stars}</div>
        <div class="desc"><h2>Descripción del producto</h2>${desc}</div>
      </section>
      <section class="accordions" aria-label="Información del producto">
        ${p.sections.map((s) => `<details class="accordion" ${s.open ? 'open' : ''}><summary>${esc(s.title)}</summary><p>${esc(s.body)}</p></details>`).join('')}
      </section>`;

    const main = $('.gallery-main img');
    const plateMain = $('#plate-main');
    const showPlate = (on) => {                      // alterna entre la foto del producto y la placa personalizada
      if (!plateMain) return;
      plateMain.hidden = !on;
      if (main) main.hidden = on;
      $$('.thumb').forEach((x) => x.removeAttribute('aria-current'));
      (on ? $('.thumb-plate') : $$('.thumb[data-src]').find((t) => t.dataset.src === main.getAttribute('src')))?.setAttribute('aria-current', 'true');
    };
    $$('.thumb').forEach((t) => t.addEventListener('click', () => {
      if ('plate' in t.dataset) return showPlate(true);
      if (main) { main.src = t.dataset.src; }
      showPlate(false);
      $$('.thumb').forEach((x) => x.removeAttribute('aria-current'));
      t.setAttribute('aria-current', 'true');
    }));
    const box = $('.gallery-main');
    box.addEventListener('mousemove', (e) => {
      const b = box.getBoundingClientRect();
      main.style.setProperty('--zx', ((e.clientX - b.left) / b.width) * 100 + '%');
      main.style.setProperty('--zy', ((e.clientY - b.top) / b.height) * 100 + '%');
    });

    /* Diseño de la placa: color y nombre. Se recuerda en el navegador para no perderlo si el cliente se va y vuelve. */
    let colorId = p.colors[0]?.id || null;
    let petName = '';
    const draftKey = `petunia-placa:${p.slug}`;
    if (plateOn) {
      try {
        const d = JSON.parse(localStorage.getItem(draftKey) || 'null');
        if (d && p.colors.some((c) => c.id === d.colorId)) colorId = d.colorId;
        if (d && typeof d.name === 'string' && !/[^\p{L}\p{M}\p{N} '\u2019.\-]/u.test(d.name)) petName = d.name.slice(0, 12);
      } catch { /* sin almacenamiento: el diseño solo dura mientras la página esté abierta */ }
    }
    const colorOf = () => p.colors.find((c) => c.id === colorId) || p.colors[0];
    const saveDraft = () => { if (!plateOn) return; try { localStorage.setItem(draftKey, JSON.stringify({ colorId, name: petName })); } catch { /* ignorar */ } };
    function drawPlate() {
      if (!plateOn) return;
      plateMain.innerHTML = `<div class="plate-main-art">${plateSVG(colorOf().hex, petName, 'Petunia')}<p>Vista previa de tu placa${petName ? '' : ' · escribe el nombre de tu mascota'}</p></div>`;
      $('#plate-thumb').innerHTML = plateSVG(colorOf().hex, petName, 'Petunia');
      const sum = $('#plate-summary');
      sum.hidden = !petName;
      sum.innerHTML = petName ? `<span>Tu placa: <b>${esc(petName)}</b> · ${esc(colorOf().name)}</span><button class="link-btn" type="button" id="plate-edit">Editar</button>` : '';
      fitPlates($('#product-detail'));
    }
    const setColor = (id) => {
      colorId = id;
      $$('#product-detail .color-swatches button').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.color) === id)));
      saveDraft(); drawPlate();
    };
    $$('#product-detail .color-swatches button').forEach((b) => b.addEventListener('click', () => setColor(Number(b.dataset.color))));
    setColor(colorId);
    if (plateOn && petName) showPlate(true);

    const buyOptions = () => ({ colorId, sizeId: Number($('#product-size')?.value) || null, ...(plateOn ? { customName: petName } : {}) });
    const addPlate = async () => {
      await addToCart(p.id, p.name, buyOptions(), { rethrow: true });
      toast(`Placa de ${petName} agregada a la bolsa`);
      openOverlay('cart');                                      // la bolsa se abre para ver la placa personalizada
    };
    const designer = () => openPlateCustomizer({
      colors: p.colors, colorId, name: petName,
      applyLabel: 'Guardar diseño', addLabel: p.stock > 0 ? `Agregar a la bolsa · ${money(p.price)}` : null,
      onApply: ({ colorId: c, name }) => { petName = name; setColor(c); showPlate(true); toast('Diseño guardado'); },
      onAdd: async ({ colorId: c, name }) => { petName = name; setColor(c); showPlate(true); await addPlate(); },
    });
    $('#custom-btn')?.addEventListener('click', designer);
    $('#plate-summary')?.addEventListener('click', (e) => { if (e.target.id === 'plate-edit') designer(); });
    $('#add-btn').addEventListener('click', () => {
      if (!plateOn) return addToCart(p.id, p.name, buyOptions());
      if (!petName) { toast('Primero escribe el nombre de tu mascota'); return designer(); }   // la placa se fabrica con ese nombre
      addPlate().catch((e) => toast(e.message));
    });

    // Opiniones
    renderReviews(p);

    if (p.related.length) { $('#related').hidden = false; $('#related-grid').innerHTML = p.related.map(cardHTML).join(''); }
  }

  /* ───────── Placa con nombre: dibujo (SVG), ajuste del texto y ventana de personalización ─────────
     Se usa en la ficha del producto, la bolsa, el carrito, el pedido y "Mis pedidos". */
  const HEX = /^#[0-9a-f]{6}$/i;
  let plateUid = 0;
  /* `ghost` es un nombre de ejemplo atenuado que se muestra mientras no haya uno escrito. */
  const plateSVG = (hex, name, ghost = '') => {
    hex = HEX.test(hex) ? hex : '#945bc0';
    const n = `pl${++plateUid}`;                                 // ids únicos: puede haber varias placas en la misma página
    return `
    <svg class="plate-svg" viewBox="0 0 400 330" role="img" aria-label="Placa${name ? ' con el nombre ' + esc(name) : ''}">
      <defs>
        <linearGradient id="${n}-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity=".4"/><stop offset=".55" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity=".26"/>
        </linearGradient>
        <linearGradient id="${n}-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f4f5f7"/><stop offset=".5" stop-color="#9aa0a8"/><stop offset="1" stop-color="#d9dce1"/>
        </linearGradient>
        <filter id="${n}-emboss" x="-10%" y="-30%" width="120%" height="170%"><feDropShadow dx="0" dy="2" stdDeviation="1.3" flood-color="#4a1d6b" flood-opacity=".45"/></filter>
        <filter id="${n}-soft" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="14" stdDeviation="10" flood-color="#2d0f55" flood-opacity=".28"/></filter>
      </defs>
      <ellipse cx="200" cy="52" rx="23" ry="27" fill="none" stroke="url(#${n}-ring)" stroke-width="6"/>
      <ellipse cx="200" cy="52" rx="23" ry="27" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5" transform="translate(-1.5 -1.5)"/>
      <g filter="url(#${n}-soft)">
        <rect x="42" y="86" width="316" height="210" rx="22" fill="none" stroke="${hex}" stroke-opacity=".6" stroke-width="5"/>
        <rect x="42" y="78" width="316" height="210" rx="22" fill="none" stroke="${hex}" stroke-opacity=".3" stroke-width="5"/>
        <rect x="40" y="70" width="320" height="214" rx="22" fill="url(#${n}-glass)" stroke="#fff" stroke-opacity=".9" stroke-width="2.5"/>
      </g>
      <rect x="176" y="60" width="48" height="22" rx="10" fill="#fff" fill-opacity=".45"/>
      <rect x="58" y="88" width="284" height="78" rx="12" fill="${hex}"/>
      <rect x="58" y="88" width="284" height="30" rx="12" fill="#fff" fill-opacity=".14"/>
      <text x="200" y="136" text-anchor="middle" class="pl-hello">Hello</text>
      <text x="200" y="156" text-anchor="middle" class="pl-sub">my name is</text>
      <rect x="58" y="246" width="284" height="20" rx="10" fill="${hex}"/>
      <rect x="58" y="246" width="284" height="7" rx="3.5" fill="#fff" fill-opacity=".2"/>
      <text x="200" y="218" text-anchor="middle" class="pl-name" filter="url(#${n}-emboss)" style="font-size:56px;${name ? '' : 'opacity:.45'}">${esc(name || ghost)}</text>
      <path d="M60 96 L130 96 L84 262 L60 262 Z" fill="#fff" fill-opacity=".14"/>
    </svg>`;
  };
  /* Miniatura cuadrada/vertical de la placa para listas (bolsa, carrito, pedidos). */
  const platePic = (hex, name) => `<span class="plate-thumb">${plateSVG(hex, name)}</span>`;
  /* Imagen de una línea: la placa personalizada si tiene nombre; si no, la foto del producto. */
  const itemPic = ({ customName, colorHex, image }) =>
    customName && colorHex ? platePic(colorHex, customName) : image ? `<img src="${esc(image)}" alt="" />` : '<span class="no-photo" aria-hidden="true"></span>';

  /* Reduce el nombre si no cabe en la placa (se mide con la fuente real, ya cargada). */
  function fitPlates(root = document) {
    $$('.pl-name', root).forEach((t) => {
      t.style.fontSize = '56px';
      let w = 0;
      try { w = t.getComputedTextLength(); } catch { return; }
      if (w > 250) t.style.fontSize = Math.max(26, Math.floor((56 * 250) / w)) + 'px';
    });
  }
  document.fonts?.ready.then(() => fitPlates());

  /* Ventana de personalización.
     opts: { colors:[{id,name,hex}], colorId, name, title, applyLabel, addLabel, requireName, onApply({colorId,name}), onAdd({colorId,name}) }
     Los callbacks pueden ser asíncronos: si lanzan un error, se muestra dentro de la ventana. */
  function openPlateCustomizer(opts) {
    let dlg = $('#plate-dialog');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'plate-dialog';
      dlg.className = 'plate-dialog';
      dlg.setAttribute('aria-labelledby', 'plate-title');
      document.body.appendChild(dlg);
    }
    dlg.innerHTML = `
      <button type="button" class="plate-close" data-close aria-label="Cerrar">×</button>
      <h2 id="plate-title">${esc(opts.title || 'Personaliza tu placa')}</h2>
      <p class="plate-lead">Escribe el nombre de tu mascota y elige el color para ver cómo quedaría.</p>
      <div class="plate-stage" id="plate-stage"></div>
      <div class="plate-field">
        <label for="plate-name-input">Nombre de tu mascota</label>
        <input id="plate-name-input" type="text" maxlength="12" autocomplete="off" spellcheck="false" placeholder="Ej. Petunia" />
        <small class="input-feedback" id="plate-name-feedback" role="status" aria-live="polite" hidden>Usa letras, números, espacios, apóstrofos, puntos o guiones.</small>
        <small id="plate-count" aria-live="polite">0/12</small>
      </div>
      <div class="plate-field">
        <span class="plate-label">Color: <b id="plate-color-name"></b></span>
        <div class="color-swatches" id="plate-swatches"></div>
      </div>
      <p class="form-error" id="plate-error" role="alert" hidden></p>
      <p class="plate-note">Vista previa ilustrativa: el acabado final de la placa puede variar ligeramente.</p>
      <div class="plate-actions">
        ${opts.addLabel ? `<button type="button" class="btn" id="plate-add">${esc(opts.addLabel)}</button>` : ''}
        <button type="button" class="btn ${opts.addLabel ? 'btn-light' : ''}" id="plate-apply">${esc(opts.applyLabel || 'Guardar diseño')}</button>
      </div>`;

    const colors = opts.colors || [];
    let selected = colors.find((c) => c.id === opts.colorId) || colors[0];
    const input = $('#plate-name-input', dlg), err = $('#plate-error', dlg), sw = $('#plate-swatches', dlg), feedback = $('#plate-name-feedback', dlg);
    const buttons = $$('#plate-add, #plate-apply', dlg);
    input.value = opts.name || '';
    sw.innerHTML = colors.map((c) => `<button type="button" data-color="${c.id}" aria-label="Color ${esc(c.name)}" title="${esc(c.name)}" style="--swatch-color:${esc(c.hex)}"></button>`).join('');

    const draw = () => {
      $('#plate-stage', dlg).innerHTML = plateSVG(selected.hex, input.value.trim(), 'Petunia');
      $('#plate-color-name', dlg).textContent = selected.name;
      $$('button', sw).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.color) === selected.id)));
      $('#plate-count', dlg).textContent = `${[...input.value].length}/12`;
      fitPlates(dlg);
    };
    sw.onclick = (e) => { const b = e.target.closest('button[data-color]'); if (!b) return; selected = colors.find((c) => c.id === Number(b.dataset.color)); draw(); };
    input.oninput = () => {
      const invalid = /[^\p{L}\p{M}\p{N} '\u2019.\-]/u.test(input.value);
      const message = feedback.textContent;
      input.setCustomValidity(invalid ? message : '');
      input.setAttribute('aria-invalid', String(invalid));
      feedback.hidden = !invalid;
      buttons.forEach((b) => { b.disabled = invalid; });
      err.hidden = true;
      draw();
    };
    dlg.onclick = (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); };

    const run = (cb, needsName) => async () => {
      const name = input.value.replace(/\s+/g, ' ').trim();
      if ((needsName || opts.requireName) && !name) { err.textContent = 'Escribe el nombre de tu mascota para continuar.'; err.hidden = false; input.focus(); return; }
      buttons.forEach((b) => { b.disabled = true; });
      try { await cb?.({ colorId: selected.id, name }); dlg.close(); }
      catch (ex) { err.textContent = ex.message || 'No pudimos guardar el diseño.'; err.hidden = false; }
      finally { buttons.forEach((b) => { b.disabled = false; }); }
    };
    $('#plate-apply', dlg).onclick = run(opts.onApply, false);
    if (opts.addLabel) $('#plate-add', dlg).onclick = run(opts.onAdd, true);
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); ($('#plate-add', dlg) || $('#plate-apply', dlg)).click(); } };

    input.oninput();
    dlg.showModal();
    input.focus();
    draw();
  }

  async function renderReviews(p) {
    const root = $('#opiniones');
    const list = await api(`/products/${encodeURIComponent(p.slug)}/reviews`);
    const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
    const form = state.user
      ? `<form class="review-form" id="review-form">
           <h3>Deja tu opinión</h3>
           <div class="star-input" role="radiogroup" aria-label="Calificación">${[5, 4, 3, 2, 1].map((n) => `<input type="radio" name="rating" id="r${n}" value="${n}" ${n === 5 ? 'checked' : ''} /><label for="r${n}" title="${n} ${n === 1 ? 'estrella' : 'estrellas'}">★</label>`).join('')}</div>
           <textarea name="body" rows="3" maxlength="1000" placeholder="Ej. Le quedó perfecto y el material es muy suave." required></textarea>
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

  async function addToCart(id, name, opts = {}, { rethrow = false } = {}) {
    try {
      const cart = await api('/cart', { method: 'POST', body: { productId: id, qty: 1, ...opts } });
      state.cart = cart; renderCounts();
      if (!rethrow) toast(`${cap(name)} agregado a la bolsa`);
      if (openPanel === 'cart') renderCart();
      return cart;
    } catch (e) { if (rethrow) throw e; toast(e.message); }
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
  let openPanel = null, lastFocus = null, chatTimer = null, checkoutResume = null;

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
    if (e.key === 'Escape' && !document.querySelector('dialog[open]')) closeOverlay();
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
  /* Edita color y nombre de una placa que ya está en la bolsa. `after(cart, keptId)` redibuja la pantalla desde la que se llamó. */
  function editDesign(item, after) {
    openPlateCustomizer({
      colors: item.colors || [], colorId: item.color?.id, name: item.customName || '', requireName: true,
      title: 'Edita tu placa', applyLabel: 'Guardar cambios',
      onApply: async ({ colorId, name }) => {
        const c = await api(`/cart/${item.id}`, { method: 'PATCH', body: { colorId, customName: name } });
        state.cart = c; renderCounts();
        toast('Placa actualizada');
        after(c, c.keptId);
      },
    });
  }
  const designLine = (i) => (i.customName ? `<span class="cart-pet">Nombre grabado: <b>${esc(i.customName)}</b></span>` : '');
  const metaLine = (i) => `${i.color ? `<span class="dot" style="--swatch-color:${esc(i.color.hex)}"></span>${esc(i.color.name)}` : ''}${i.color && i.size ? ' · ' : ''}${esc(i.size || '')}`;
  const pic = (i) => itemPic({ customName: i.customName, colorHex: i.color?.hex, image: i.image });

  async function renderCart() {
    titleEl.textContent = 'Tu bolsa';
    const cart = await api('/cart');
    state.cart = cart; renderCounts();
    if (openPanel !== 'cart') return;
    if (!cart.items.length) { body.innerHTML = emptyHTML('Tu bolsa está vacía.', 'perros.html', 'Ver productos'); return; }
    body.innerHTML = `<ul class="cart-list">${cart.items.map((i) => `
      <li class="cart-item" data-item="${i.id}">
        <a class="cart-pic" href="detalle-carrito.html?item=${i.id}" aria-label="Ver ${esc(cap(i.name))}${i.customName ? ' de ' + esc(i.customName) : ''} en grande">${pic(i)}</a>
        <div class="cart-info">
          <a class="cart-name" href="producto.html?slug=${encodeURIComponent(i.slug)}">${esc(cap(i.name))}</a>
          <small>${metaLine(i)}</small>
          ${designLine(i)}
          <div class="qty" role="group" aria-label="Cantidad">
            <button type="button" data-qty="${i.qty - 1}" aria-label="Quitar uno">−</button><span>${i.qty}</span><button type="button" data-qty="${i.qty + 1}" aria-label="Agregar uno">+</button>
          </div>
          ${i.personalizable ? '<button class="link-btn" type="button" data-edit>Editar diseño</button>' : ''}
        </div>
        <div class="cart-side"><strong>${money(i.lineTotal)}</strong><button class="link-btn" type="button" data-remove>Quitar</button></div>
      </li>`).join('')}</ul>
      <div class="cart-foot"><div class="subtotal"><span>Subtotal</span><strong>${money(cart.subtotal)}</strong></div>
      <a class="btn btn-light" href="detalle-carrito.html">Ver detalle del carrito</a>
      <button class="btn" type="button" id="go-checkout">Finalizar compra</button></div>`;
    fitPlates(body);
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
      } else if (e.target.closest('[data-edit]') && item) {
        const line = state.cart.items.find((x) => String(x.id) === item.dataset.item);
        if (line) editDesign(line, () => renderCart());
      } else if (e.target.id === 'go-checkout') location.href = 'carrito.html';
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
        if (checkoutResume) {
          const resume = checkoutResume;
          checkoutResume = null;
          closeOverlay();
          resume();
        } else if (document.body.dataset.page === 'product') { closeOverlay(); setTimeout(() => location.reload(), 150); } else renderAccount();
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
          <ul class="order-items">${o.items.map((i) => `<li>${itemPic(i)}<span>${i.qty} × ${esc(cap(i.name))}${i.customName ? ` · “${esc(i.customName)}”` : ''}${i.color ? ` (${esc(i.color)})` : ''}</span></li>`).join('')}</ul><footer>${new Date(o.createdAt).toLocaleDateString('es')} · ${money(o.total)}</footer></article>`).join('') : '<p class="muted">Todavía no has hecho pedidos.</p>'}
        <button class="btn btn-light" type="button" id="logout">Cerrar sesión</button>`;
      fitPlates(body);
      return;
    }
    titleEl.textContent = tab === 'login' ? 'Ingresar' : 'Crear cuenta';
    body.innerHTML = `<div class="tabs" role="tablist"><button type="button" role="tab" data-tab="login" aria-selected="${tab === 'login'}">Ingresar</button><button type="button" role="tab" data-tab="register" aria-selected="${tab !== 'login'}">Crear cuenta</button></div>
      ${checkoutResume ? '<p class="muted">Para finalizar tu compra, inicia sesión o crea una cuenta.</p>' : ''}
      ${tab === 'login' ? `<form class="stack" id="login-form">
        <label class="field">Correo electrónico<input name="email" type="email" data-validate="email" placeholder="Ej. john@correo.com" required autocomplete="email" /></label>
        <label class="field">Contraseña<input name="password" type="password" placeholder="Escribe tu contraseña" required autocomplete="current-password" /></label>
        <p class="form-error" role="alert" hidden></p><button class="btn" type="submit">Ingresar</button></form>`
      : `<form class="stack" id="register-form">
        <label class="field">Nombre<input name="name" data-validate="name" placeholder="Ej. John Doe" required maxlength="80" autocomplete="name" /></label>
        <label class="field">Correo electrónico<input name="email" type="email" data-validate="email" placeholder="Ej. john@correo.com" required autocomplete="email" /></label>
        <label class="field">Contraseña (mínimo 8 caracteres)<input name="password" type="password" placeholder="Mínimo 8 caracteres" required minlength="8" autocomplete="new-password" /></label>
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
    body.innerHTML = '<div class="chat-log" aria-live="polite"></div><form class="chat-form" id="chat-form"><input name="body" maxlength="1000" placeholder="Ej. ¿Tienen collares para gatos?" required autocomplete="off" aria-label="Mensaje" /><button class="btn btn-small" type="submit">Enviar</button></form><p class="form-error" role="alert" hidden></p>';
    const load = async () => { const c = await api('/chat'); if (openPanel === 'chat') drawChat(c.messages, c.greeting); };
    await load();
    chatTimer = setInterval(load, 15000);
  }

  /* ───────── Página de detalle de compra ───────── */
  const money2 = (n) => '$' + Number(n).toFixed(2);

  async function checkoutPage() {
    const root = $('#checkout-root');
    if (!root) return;
    let step = 'review';

    function productCell(i, editable) {
      const href = `producto.html?slug=${encodeURIComponent(i.slug)}`;
      return `<div class="checkout-product">
        <a class="cart-pic" href="detalle-carrito.html?item=${i.id}" aria-label="Ver ${esc(cap(i.name))}${i.customName ? ' de ' + esc(i.customName) : ''} en grande">${pic(i)}</a>
        <div class="checkout-meta">
          <a class="checkout-name" href="${href}">${esc(cap(i.name))}</a>
          ${i.size ? `<p>${esc(/^talla/i.test(i.size) ? i.size : `Talla: ${i.size}`)}</p>` : ''}
          ${i.color ? `<p><span class="dot" style="--swatch-color:${esc(i.color.hex)}"></span>Color: ${esc(i.color.name)}</p>` : ''}
          ${i.customName ? `<p class="checkout-pet">Nombre grabado: <b>${esc(i.customName)}</b></p>` : ''}
          ${editable && i.personalizable ? '<button class="link-btn" type="button" data-edit>Editar diseño</button>' : ''}
        </div>
        ${editable ? `<button class="remove-x" type="button" data-remove aria-label="Quitar ${esc(cap(i.name))}">×</button>` : ''}
      </div>`;
    }

    function sheet(cart) {
      const editable = step === 'review';
      const rows = cart.items.map((i) => `<tr data-item="${i.id}">
        <td>${productCell(i, editable)}</td>
        <td class="checkout-num" data-label="Precio">${money2(i.unitPrice)}</td>
        <td data-label="Cantidad">${editable
          ? `<div class="qty" role="group" aria-label="Cantidad de ${esc(cap(i.name))}"><button type="button" data-qty="${i.qty - 1}" aria-label="Quitar uno">−</button><span>${i.qty}</span><button type="button" data-qty="${i.qty + 1}" aria-label="Agregar uno">+</button></div>`
          : `<span class="checkout-num">${i.qty}</span>`}</td>
        <td class="checkout-num" data-label="Total">${money2(i.lineTotal)}</td>
      </tr>`).join('');
      const u = state.user || {};
      const form = step === 'details' ? `<form class="stack" id="checkout-form">
          <h2 id="delivery-title">Datos de entrega</h2>
          <label class="field">Nombre<input name="name" data-validate="name" placeholder="Ej. John Doe" required maxlength="100" value="${esc(u.name || '')}" autocomplete="name" /></label>
          <label class="field">Correo electrónico<input name="email" type="email" data-validate="email" placeholder="Ej. john@correo.com" required value="${esc(u.email || '')}" autocomplete="email" /></label>
          <label class="field">Teléfono<input name="phone" type="tel" data-validate="phone" placeholder="Ej. +1 555 123 4567" maxlength="40" autocomplete="tel" /></label>
          <label class="field">Dirección de entrega<textarea name="address" rows="3" placeholder="Ej. Calle 10, casa 25, Ciudad" required maxlength="300" autocomplete="street-address"></textarea></label>
          <label class="field">Notas (opcional)<textarea name="notes" rows="2" placeholder="Ej. Entregar después de las 3 p. m." maxlength="500"></textarea></label>
          <p class="form-error" role="alert" hidden></p>
          <button class="btn" type="submit">Confirmar pedido · ${money2(cart.total)}</button>
        </form>` : '<button class="btn" type="button" id="checkout-next">Siguiente</button>';
      return `<div class="checkout-top">
        <button class="checkout-back" type="button" id="checkout-back">Atrás</button>
        <h1 class="section-title">Carrito</h1>
        <span class="checkout-links"><a class="link-all" href="detalle-carrito.html">Ver detalle y ampliar imágenes</a><a class="link-all checkout-continue" href="index.html">Continuar comprando</a></span>
      </div>
      <div class="checkout-layout">
        <section class="checkout-sheet" aria-label="Productos del pedido">
          <table class="checkout-table">
            <thead><tr>
              <th scope="col">Resumen del pedido</th>
              <th scope="col">Precio</th>
              <th scope="col">Cantidad</th>
              <th scope="col">Total</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </section>
        <aside class="checkout-summary">
          <h2>Tu pedido</h2>
          <dl>
            <dt>Subtotal (${cart.count})</dt><dd>${money2(cart.subtotal)}</dd>
            <dt>Impuesto</dt><dd>${money2(cart.tax)}</dd>
            <dt>Envío</dt><dd>${money2(cart.shipping)}</dd>
            <dt class="grand">Total del pedido</dt><dd class="grand">${money2(cart.total)}</dd>
          </dl>
          <p class="checkout-note">El importe total que usted paga incluye todos los aranceles e impuestos aplicables.</p>
          ${form}
        </aside>
      </div>`;
    }

    async function draw() {
      const cart = await api('/cart');
      state.cart = cart;
      renderCounts();
      if (!cart.items.length) {
        step = 'review';
        root.innerHTML = `<div class="checkout-top">
          <a class="checkout-back" href="index.html">Atrás</a>
          <h1 class="section-title">Carrito</h1>
          <a class="link-all checkout-continue" href="index.html">Continuar comprando</a>
        </div>${emptyHTML('Tu bolsa está vacía.', 'perros.html', 'Ver productos')}`;
        return;
      }
      root.innerHTML = sheet(cart);
      fitPlates(root);
    }

    root.addEventListener('click', async (e) => {
      if (e.target.id === 'checkout-back') {
        if (step === 'details') { step = 'review'; draw(); }
        else if (history.length > 1) history.back();
        else location.href = 'index.html';
        return;
      }
      if (e.target.id === 'checkout-next') {
        if (state.user) { step = 'details'; draw(); }
        else {
          checkoutResume = () => { step = 'details'; draw(); };
          openOverlay('account');
        }
        return;
      }
      const item = e.target.closest('[data-item]');
      if (!item || step !== 'review') return;
      try {
        if (e.target.closest('[data-edit]')) {
          const line = state.cart.items.find((x) => String(x.id) === item.dataset.item);
          if (line) editDesign(line, () => draw());
        } else if (e.target.closest('[data-qty]')) {
          const qty = Number(e.target.closest('[data-qty]').dataset.qty);
          state.cart = qty < 1
            ? await api(`/cart/${item.dataset.item}`, { method: 'DELETE' })
            : await api(`/cart/${item.dataset.item}`, { method: 'PATCH', body: { qty } });
          renderCounts();
          draw();
        } else if (e.target.closest('[data-remove]')) {
          state.cart = await api(`/cart/${item.dataset.item}`, { method: 'DELETE' });
          renderCounts();
          draw();
        }
      } catch (ex) { toast(ex.message); }
    });

    root.addEventListener('submit', async (e) => {
      if (e.target.id !== 'checkout-form') return;
      e.preventDefault();
      const f = e.target, err = $('.form-error', f), data = Object.fromEntries(new FormData(f));
      if (err) err.hidden = true;
      try {
        const o = await api('/orders', { method: 'POST', body: data });
        state.cart = { items: [], count: 0, subtotal: 0 }; renderCounts();
        step = 'done';
        root.innerHTML = `<div class="checkout-done">
          <h1 class="section-title">¡Pedido recibido!</h1>
          <p>Gracias, ${esc(data.name)}. Tu pedido <strong>${esc(o.code)}</strong> por <strong>${money2(o.total)}</strong> quedó registrado.</p>
          <ul class="done-items" aria-label="Lo que pediste">${(o.items || []).map((i) => `<li>${pic(i)}<span><b>${i.qty} × ${esc(cap(i.name))}</b>${i.color ? `<br>${esc(i.color.name)}` : ''}${i.customName ? `<br>Nombre grabado: <b>${esc(i.customName)}</b>` : ''}</span></li>`).join('')}</ul>
          <p class="muted">Te contactaremos a ${esc(data.email)} para coordinar el pago y la entrega.</p>
          <a class="btn" href="index.html">Seguir comprando</a>
        </div>`;
        fitPlates(root);
      } catch (ex) {
        if (ex.status === 401) {
          state.user = null;
          await loadState();
          checkoutResume = () => { step = 'details'; draw(); };
          openOverlay('account');
        } else if (err) { err.textContent = ex.message; err.hidden = false; } else toast(ex.message);
      }
    });

    await draw();
  }

  /* ───────── Detalle del carrito: cada producto en grande ─────────
     Imagen ampliada (con zoom y pantalla completa), la placa personalizada con su nombre, todas las fotos del
     producto, y los mismos controles de cantidad / edición / quitar que el resto de la tienda. */
  async function cartDetailPage() {
    const root = $('#cd-root');
    if (!root) return;
    let cart = await api('/cart');
    state.cart = cart; renderCounts();

    const want = new URLSearchParams(location.search).get('item') || location.hash.replace('#item-', '');
    let sel = Math.max(0, cart.items.findIndex((i) => String(i.id) === String(want)));   // producto seleccionado
    let view = 0;                                                                          // vista del producto (placa / foto 1 / foto 2…)

    const isPlate = (i) => !!(i.customName && i.color);
    /* Vistas de un producto: la placa personalizada (si la hay) y luego todas sus fotos. */
    const viewsOf = (i) => {
      const v = [];
      if (isPlate(i)) v.push({ kind: 'plate', label: 'Tu placa', caption: `Vista previa de tu placa para ${i.customName}, en color ${i.color.name.toLowerCase()}.` });
      i.images.forEach((im, k) => v.push({ kind: 'photo', src: im.src, alt: im.alt, label: isPlate(i) ? 'Foto del producto' : `Foto ${k + 1}`,
        caption: isPlate(i) ? 'Así lucen las placas terminadas (foto de referencia).' : cap(i.name) }));
      return v.length ? v : [{ kind: 'none', label: 'Sin foto', caption: cap(i.name) }];
    };
    const art = (i, v, cls = '') => v.kind === 'plate' ? `<div class="cd-art cd-plate ${cls}">${plateSVG(i.color.hex, i.customName)}</div>`
      : v.kind === 'photo' ? `<div class="cd-art ${cls}"><img src="${esc(v.src)}" alt="${esc(v.alt)}" /></div>`
      : `<div class="cd-art cd-none ${cls}"><span>Este producto todavía no tiene foto.</span></div>`;
    const viewThumb = (i, v) => v.kind === 'plate' ? platePic(i.color.hex, i.customName) : v.kind === 'photo' ? `<img src="${esc(v.src)}" alt="" />` : '<span class="no-photo" aria-hidden="true"></span>';

    function itemCard(i, k) {
      return `<li class="cd-item${k === sel ? ' is-selected' : ''}" data-item="${i.id}">
        <button class="cd-pick" type="button" data-pick="${k}" aria-pressed="${k === sel}" aria-label="Ver ${esc(cap(i.name))}${i.customName ? ' de ' + esc(i.customName) : ''} en grande">${pic(i)}</button>
        <div class="cd-meta">
          <a class="cd-name" href="producto.html?slug=${encodeURIComponent(i.slug)}">${esc(cap(i.name))}</a>
          <p class="cd-tags">${metaLine(i)}</p>
          ${designLine(i)}
          <div class="cd-row">
            <div class="qty" role="group" aria-label="Cantidad de ${esc(cap(i.name))}"><button type="button" data-qty="${i.qty - 1}" aria-label="Quitar uno">−</button><span>${i.qty}</span><button type="button" data-qty="${i.qty + 1}" aria-label="Agregar uno">+</button></div>
            <strong class="cd-total">${money2(i.lineTotal)}</strong>
          </div>
          <p class="cd-unit">${money2(i.unitPrice)} c/u</p>
          <div class="cd-actions">
            ${i.personalizable ? '<button class="link-btn" type="button" data-edit>Editar diseño</button>' : ''}
            <button class="link-btn" type="button" data-remove>Quitar</button>
          </div>
        </div>
      </li>`;
    }

    function draw() {
      const top = (n) => `<div class="cd-top"><nav class="breadcrumbs" aria-label="Ruta de navegación"><a href="index.html">Home</a><span class="sep" aria-hidden="true">/</span><span aria-current="page">Detalle del carrito</span></nav>
        <h1 class="section-title">Detalle de tu carrito</h1>${n ? `<p class="muted">${n} ${n === 1 ? 'producto' : 'productos'} · elige uno para verlo en grande</p>` : ''}</div>`;
      if (!cart.items.length) { root.innerHTML = top(0) + emptyHTML('Tu carrito está vacío.', 'perros.html', 'Ver productos'); return; }
      sel = Math.min(Math.max(sel, 0), cart.items.length - 1);
      const it = cart.items[sel], views = viewsOf(it);
      view = Math.min(Math.max(view, 0), views.length - 1);
      const v = views[view];
      root.innerHTML = `${top(cart.count)}
        <div class="cd-layout">
          <section class="cd-viewer" aria-label="Vista ampliada de ${esc(cap(it.name))}">
            <div class="cd-stage" id="cd-stage">
              ${art(it, v, 'cd-zoomable')}
              ${views.length > 1 ? '<button class="cd-nav cd-prev" type="button" data-step="-1" aria-label="Vista anterior">‹</button><button class="cd-nav cd-next" type="button" data-step="1" aria-label="Vista siguiente">›</button>' : ''}
              <button class="cd-open" type="button" id="cd-open" aria-haspopup="dialog">⤢ Pantalla completa</button>
            </div>
            <p class="cd-caption" aria-live="polite">${esc(v.caption)}</p>
            ${views.length > 1 ? `<div class="cd-views" role="group" aria-label="Vistas de ${esc(cap(it.name))}">${views.map((x, k) => `<button class="cd-view" type="button" data-view="${k}" aria-current="${k === view}" aria-label="${esc(x.label)}">${viewThumb(it, x)}<span>${esc(x.label)}</span></button>`).join('')}</div>` : ''}
            ${isPlate(it) ? `<p class="cd-engrave">Nombre grabado <strong>${esc(it.customName)}</strong><span>Color ${esc(it.color.name.toLowerCase())}</span></p>` : ''}
          </section>
          <section class="cd-side" aria-label="Productos de tu carrito">
            <ul class="cd-items">${cart.items.map(itemCard).join('')}</ul>
            <aside class="cd-summary" aria-label="Resumen del pedido">
              <h2>Resumen</h2>
              <dl>
                <dt>Subtotal (${cart.count})</dt><dd>${money2(cart.subtotal)}</dd>
                <dt>Impuesto</dt><dd>${money2(cart.tax)}</dd>
                <dt>Envío</dt><dd>${money2(cart.shipping)}</dd>
                <dt class="grand">Total</dt><dd class="grand">${money2(cart.total)}</dd>
              </dl>
              <a class="btn" href="carrito.html">Continuar con el pedido</a>
              <a class="link-all" href="index.html">Seguir comprando</a>
            </aside>
          </section>
        </div>`;
      fitPlates(root);
    }

    /* Pantalla completa: la vista actual, muy grande, con flechas para recorrer las vistas del producto. */
    function lightbox() {
      const it = cart.items[sel]; if (!it) return;
      const views = viewsOf(it);
      let dlg = $('#cd-lightbox');
      if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'cd-lightbox'; dlg.className = 'cd-lightbox'; dlg.setAttribute('aria-label', 'Imagen ampliada'); document.body.appendChild(dlg); }
      const paint = () => {
        const v = views[view];
        dlg.innerHTML = `<button type="button" class="plate-close" data-close aria-label="Cerrar">×</button>
          ${views.length > 1 ? '<button class="cd-nav cd-prev" type="button" data-lb="-1" aria-label="Vista anterior">‹</button><button class="cd-nav cd-next" type="button" data-lb="1" aria-label="Vista siguiente">›</button>' : ''}
          ${art(it, v, 'cd-lb-art')}<p class="cd-caption">${esc(cap(it.name))}${isPlate(it) && v.kind === 'plate' ? ` · ${esc(it.customName)}` : ''} — ${esc(v.label)}${views.length > 1 ? ` (${view + 1}/${views.length})` : ''}</p>`;
        fitPlates(dlg);
      };
      dlg.onclick = (e) => {
        if (e.target === dlg || e.target.closest('[data-close]')) { dlg.close(); return; }
        const b = e.target.closest('[data-lb]'); if (b) { view = (view + Number(b.dataset.lb) + views.length) % views.length; paint(); }
      };
      dlg.onkeydown = (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { view = (view + (e.key === 'ArrowRight' ? 1 : -1) + views.length) % views.length; paint(); } };
      dlg.onclose = () => { draw(); $('#cd-open')?.focus(); };
      paint();
      dlg.showModal();
    }

    /* Después de cambiar algo en la bolsa, se vuelve a mostrar el mismo producto (o el más cercano). */
    const refresh = (c, keepId) => {
      const id = keepId ?? cart.items[sel]?.id;
      cart = c; state.cart = c; renderCounts();
      const k = cart.items.findIndex((i) => i.id === id);
      sel = k >= 0 ? k : Math.min(sel, cart.items.length - 1);
      draw();
    };

    root.addEventListener('click', async (e) => {
      const t = e.target;
      try {
        const pick = t.closest('[data-pick]');
        if (pick) { sel = Number(pick.dataset.pick); view = 0; history.replaceState(null, '', `?item=${cart.items[sel].id}`); draw(); $(`[data-pick="${sel}"]`, root)?.focus(); return; }
        const vw = t.closest('[data-view]');
        if (vw) { view = Number(vw.dataset.view); draw(); $(`[data-view="${view}"]`, root)?.focus(); return; }
        const st = t.closest('[data-step]');
        if (st) { const n = viewsOf(cart.items[sel]).length; view = (view + Number(st.dataset.step) + n) % n; draw(); $(`[data-step="${st.dataset.step}"]`, root)?.focus(); return; }
        if (t.closest('#cd-open')) { lightbox(); return; }
        const row = t.closest('[data-item]');
        if (!row) return;
        const line = cart.items.find((x) => String(x.id) === row.dataset.item);
        if (!line) return;
        if (t.closest('[data-qty]')) {
          const qty = Number(t.closest('[data-qty]').dataset.qty);
          refresh(qty < 1 ? await api(`/cart/${line.id}`, { method: 'DELETE' }) : await api(`/cart/${line.id}`, { method: 'PATCH', body: { qty } }), qty < 1 ? null : line.id);
        } else if (t.closest('[data-remove]')) {
          refresh(await api(`/cart/${line.id}`, { method: 'DELETE' }), null);
        } else if (t.closest('[data-edit]')) {
          editDesign(line, (c, keptId) => { view = 0; refresh(c, keptId); });
        }
      } catch (ex) { toast(ex.message); }
    });

    // Zoom con el cursor sobre la imagen (igual que en la ficha del producto)
    root.addEventListener('mousemove', (e) => {
      const z = e.target.closest('.cd-stage')?.querySelector('.cd-zoomable');
      if (!z) return;
      const b = z.getBoundingClientRect();
      z.style.setProperty('--zx', ((e.clientX - b.left) / b.width) * 100 + '%');
      z.style.setProperty('--zy', ((e.clientY - b.top) / b.height) * 100 + '%');
    });

    draw();
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
  const pages = { home: homePage, catalog: catalogPage, product: productPage, search: searchPage, checkout: checkoutPage, 'cart-detail': cartDetailPage };
  (async () => {
    await loadState().catch(() => {});
    const run = pages[document.body.dataset.page];
    if (run) await run().catch((e) => { console.error(e); toast('No pudimos cargar la página. Recárgala e inténtalo de nuevo.'); });
  })();
})();
