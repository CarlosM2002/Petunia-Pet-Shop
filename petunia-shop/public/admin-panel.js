/* Panel de administración de Petunia Pet Shop. Todo lo que viene de la base de datos se escapa con esc(). */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let feedbackId = 0;
  document.addEventListener('input', (event) => {
    const input = event.target.closest('[data-allowed-chars="email"]');
    if (!input) return;
    showEmailFeedback(input);
  });
  function showEmailFeedback(input) {
    let feedback = input.nextElementSibling;
    if (!feedback?.classList.contains('input-feedback')) {
      feedback = document.createElement('small');
      feedback.className = 'input-feedback';
      feedback.setAttribute('aria-live', 'polite');
      feedback.id = `admin-input-feedback-${++feedbackId}`;
      input.after(feedback);
      input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), feedback.id].filter(Boolean).join(' '));
    }
    const invalid = !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~@-]*$/.test(input.value);
    const message = 'Revisa el correo: no uses espacios ni caracteres especiales no válidos.';
    input.setCustomValidity(invalid ? message : '');
    input.setAttribute('aria-invalid', String(invalid));
    feedback.textContent = invalid ? message : '';
    feedback.hidden = !invalid;
  }
  const money = (c) => '$' + (c / 100).toFixed(2);
  const fdate = (iso) => (iso ? new Date(iso).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
  const STATUS = { pending: 'Pendiente', paid: 'En proceso', shipped: 'Enviado', delivered: 'Recibido', cancelled: 'Cancelado' };
  const PSTATUS = { activa: ['Activa', 'ok'], programada: ['Programada', 'warn'], vencida: ['Vencida', 'bad'], pausada: ['Pausada', ''] };
  const SCOPE = { all: 'Todo el catálogo', category: 'Una categoría', collection: 'Una colección', products: 'Productos elegidos' };

  async function api(path, { method = 'GET', body, raw } = {}) {
    const opts = { method, headers: {} };
    if (raw) { opts.body = raw; opts.headers['Content-Type'] = raw.type; }
    else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
    const r = await fetch('/api' + path, opts);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Ocurrió un error.');
    return data;
  }
  let toastTimer;
  function toast(msg, isErr) {
    const t = $('#toast'); t.textContent = msg; t.className = 'show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, 3200);
  }
  const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, true); } };

  /* ───────── Diálogo ───────── */
  const dlg = $('#dlg');
  const closeDlg = () => dlg.close();
  function openDlg(html) { dlg.innerHTML = html; dlg.showModal(); return dlg; }
  dlg.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeDlg(); });

  /* ───────── Sesión ───────── */
  let ME = null, META = null;
  async function boot() {
    const { user } = await api('/auth/me');
    ME = user;
    $('#gate').hidden = !!(user && user.role === 'admin');
    $('#app').hidden = !(user && user.role === 'admin');
    if (user && user.role !== 'admin') {
      $('#gate-msg').textContent = `La cuenta ${user.email} no tiene permisos de administrador.`;
      $('#gate-logout').hidden = false;
    }
    if (user && user.role === 'admin') {
      $('#me').textContent = user.email;
      META = await api('/admin/meta');
      go(location.hash.slice(1) || 'resumen');
    }
  }
  $('#login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { await api('/auth/login', { method: 'POST', body: { email: f.get('email'), password: f.get('password') } }); $('#login-error').textContent = ''; boot(); }
    catch (err) { $('#login-error').textContent = err.message; }
  });
  const logout = async () => { await api('/auth/logout', { method: 'POST' }); location.reload(); };
  $('#logout').addEventListener('click', logout);
  $('#gate-logout').addEventListener('click', logout);

  /* ───────── Navegación ───────── */
  const VIEWS = { resumen: vResumen, pedidos: vPedidos, productos: vProductos, clientes: vClientes, colecciones: vColecciones, promociones: vPromociones, ayuda: vAyuda };
  async function go(name) {
    if (!VIEWS[name]) name = 'resumen';
    location.hash = name;
    document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
    $('#view').innerHTML = '<p class="muted">Cargando…</p>';
    try { await VIEWS[name](); } catch (e) { $('#view').innerHTML = `<p class="error">${esc(e.message)}</p>`; }
  }
  $('#nav').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) go(b.dataset.view); });
  const view = $('#view');

  /* ───────── Resumen ───────── */
  async function vResumen() {
    const s = await api('/admin/stats');
    const n = (k) => s.ordersByStatus[k] || 0;
    view.innerHTML = `<h1>Resumen</h1>
      <div class="stats">
        <div class="card stat"><strong>${n('pending')}</strong><span>Pedidos pendientes</span></div>
        <div class="card stat"><strong>${n('paid')}</strong><span>En proceso</span></div>
        <div class="card stat"><strong>${n('shipped')}</strong><span>Enviados</span></div>
        <div class="card stat"><strong>${n('delivered')}</strong><span>Recibidos</span></div>
        <div class="card stat"><strong>${money(s.revenueCents)}</strong><span>Ventas (sin cancelados)</span></div>
        <div class="card stat"><strong>${s.users}</strong><span>Usuarios registrados</span></div>
        <div class="card stat"><strong>${s.products}</strong><span>Productos activos</span></div>
      </div>
      <h2>Poco stock</h2>
      ${s.lowStock.length ? `<div class="stack">${s.lowStock.map((p) => `<div class="row"><span class="grow">${esc(p.name)}</span><span class="badge ${p.stock ? 'warn' : 'bad'}">${p.stock} en stock</span></div>`).join('')}</div>` : '<p class="muted">Todo en orden.</p>'}`;
  }

  /* ───────── Pedidos ───────── */
  const oState = { status: '', q: '', page: 1 };
  async function vPedidos() {
    const qs = new URLSearchParams({ page: oState.page });
    if (oState.status) qs.set('status', oState.status);
    if (oState.q) qs.set('q', oState.q);
    const d = await api('/admin/orders?' + qs);
    const opts = (cur) => Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${l}</option>`).join('');
    view.innerHTML = `<h1>Pedidos <span class="muted">(${d.total})</span></h1>
      <div class="bar"><select id="o-status"><option value="">Todos los estados</option>${opts(oState.status)}</select>
        <input id="o-q" class="grow" type="search" placeholder="Buscar por código, nombre o correo" value="${esc(oState.q)}">
        <button class="btn" id="o-go">Buscar</button></div>
      <div class="stack">${d.orders.map((o) => `
        <article class="card order">
          <header><div><strong>${esc(o.code)}</strong> <span class="muted">· ${fdate(o.createdAt)}</span></div>
            <select class="status s-${o.status}" data-order="${o.id}" aria-label="Estado del pedido">${opts(o.status)}</select></header>
          <div class="cols">
            <div><b>${esc(o.customerName)}</b><br>${esc(o.email)}${o.phone ? `<br>${esc(o.phone)}` : ''}${o.userId ? '<br><span class="badge ok">Usuario registrado</span>' : ''}</div>
            <div>${esc(o.address)}${o.notes ? `<br><em class="muted">${esc(o.notes)}</em>` : ''}</div>
            <div class="total">${money(o.totalCents)}</div>
          </div>
          <ul class="items">${o.items.map((i) => `<li>${i.qty} × ${esc(i.name)}${i.color ? ` · ${esc(i.color)}` : ''}${i.size ? ` · ${esc(i.size)}` : ''} — ${money(i.unitPriceCents)}</li>`).join('')}</ul>
        </article>`).join('') || '<p class="muted">No hay pedidos con ese filtro.</p>'}</div>
      <div class="pager"><button class="btn ghost sm" id="o-prev" ${d.page <= 1 ? 'disabled' : ''}>← Anterior</button><span class="muted">Página ${d.page} de ${d.pages}</span><button class="btn ghost sm" id="o-next" ${d.page >= d.pages ? 'disabled' : ''}>Siguiente →</button></div>`;
    const search = () => { oState.status = $('#o-status').value; oState.q = $('#o-q').value.trim(); oState.page = 1; go('pedidos'); };
    $('#o-go').onclick = search; $('#o-status').onchange = search; $('#o-q').onkeydown = (e) => { if (e.key === 'Enter') search(); };
    $('#o-prev').onclick = () => { oState.page--; go('pedidos'); }; $('#o-next').onclick = () => { oState.page++; go('pedidos'); };
  }
  view.addEventListener('change', guard(async (e) => {
    const sel = e.target.closest('select[data-order]');
    if (!sel) return;
    await api('/admin/orders/' + sel.dataset.order, { method: 'PATCH', body: { status: sel.value } }).catch((err) => { go('pedidos'); throw err; });
    sel.className = 'status s-' + sel.value;
    toast('Estado actualizado: ' + STATUS[sel.value]);
  }));

  /* ───────── Productos ───────── */
  const pState = { q: '', category: '', status: 'active' };
  async function vProductos() {
    const qs = new URLSearchParams({ status: pState.status }); if (pState.q) qs.set('q', pState.q); if (pState.category) qs.set('category', pState.category);
    const list = await api('/admin/products?' + qs);
    view.innerHTML = `<h1>Productos <span class="muted">(${list.length})</span></h1>
      <div class="bar"><input id="p-q" class="grow" type="search" placeholder="Buscar producto" value="${esc(pState.q)}">
        <select id="p-cat"><option value="">Todas las categorías</option>${META.categories.map((c) => `<option value="${c.slug}" ${pState.category === c.slug ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <select id="p-status">${[['active', 'Activos'], ['archived', 'Archivados'], ['all', 'Todos']].map(([v, l]) => `<option value="${v}" ${pState.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn" id="p-new">+ Nuevo producto</button></div>
      <div class="scroll"><table><thead><tr><th></th><th>Producto</th><th>Categoría</th><th class="num">Precio</th><th class="num">Stock</th><th></th></tr></thead><tbody>
      ${list.map((p) => `<tr>
        <td>${p.image ? `<img class="thumb" src="/media/${esc(p.image)}" alt="">` : '<div class="thumb"></div>'}</td>
        <td><strong>${esc(p.name)}</strong><br><span class="muted">${esc(p.subtitle || '')}</span><br>
          ${p.isNew ? '<span class="badge">Nuevo</span>' : ''}${p.bestseller ? '<span class="badge">Más vendido</span>' : ''}${p.latest ? '<span class="badge">Últimos modelos</span>' : ''}${p.active ? '' : '<span class="badge bad">Archivado</span>'}</td>
        <td>${esc(p.categoryName)}<br><span class="muted">${esc([p.type, p.collection].filter(Boolean).join(' · '))}</span></td>
        <td class="num">${p.salePriceCents != null ? `<s class="muted">${money(p.priceCents)}</s><br><strong>${money(p.salePriceCents)}</strong>` : money(p.priceCents)}</td>
        <td class="num">${p.stock <= 5 ? `<span class="badge ${p.stock ? 'warn' : 'bad'}">${p.stock}</span>` : p.stock}</td>
        <td><div class="acts"><button class="btn sm" data-edit="${p.id}">Editar</button>
          ${p.active ? `<button class="btn ghost sm" data-archive="${p.id}">Archivar</button>` : `<button class="btn ghost sm" data-restore="${p.id}">Restaurar</button><button class="btn danger sm" data-hard="${p.id}">Eliminar</button>`}</div></td></tr>`).join('') || '<tr><td colspan="6" class="muted">No hay productos.</td></tr>'}
      </tbody></table></div>`;
    const reload = () => { pState.q = $('#p-q').value.trim(); pState.category = $('#p-cat').value; pState.status = $('#p-status').value; go('productos'); };
    $('#p-q').onkeydown = (e) => { if (e.key === 'Enter') reload(); }; $('#p-cat').onchange = reload; $('#p-status').onchange = reload;
    $('#p-new').onclick = guard(() => productEditor(null));
  }
  view.addEventListener('click', guard(async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.edit) return productEditor(b.dataset.edit);
    if (b.dataset.archive && confirm('¿Archivar este producto? Dejará de verse en la tienda, pero podrás restaurarlo.')) { await api('/admin/products/' + b.dataset.archive, { method: 'PATCH', body: { active: false } }); toast('Producto archivado'); go('productos'); }
    if (b.dataset.restore) { await api('/admin/products/' + b.dataset.restore, { method: 'PATCH', body: { active: true } }); toast('Producto restaurado'); go('productos'); }
    if (b.dataset.hard && confirm('¿Eliminar definitivamente? Esta acción no se puede deshacer (los pedidos anteriores conservan su detalle).')) { await api('/admin/products/' + b.dataset.hard + '?hard=1', { method: 'DELETE' }); toast('Producto eliminado'); go('productos'); }
  }));

  async function productEditor(id) {
    const [media] = await Promise.all([api('/admin/media')]);
    const p = id ? await api('/admin/products/' + id) : { name: '', subtitle: '', description: '', priceCents: 0, stock: 100, active: true, isNew: false, bestseller: false, latest: false,
      category: META.categories[0].slug, type: '', collection: '', images: [], colors: [], sizes: ['Talla única'], sections: null };
    const draft = { images: [...p.images], colors: p.colors.map((c) => ({ ...c })), sections: p.sections ? p.sections.map((s) => ({ ...s })) : [] };
    const sel = (name, items, cur, blank) => `<select name="${name}">${blank ? `<option value="">${blank}</option>` : ''}${items.map((i) => `<option value="${esc(i.slug)}" ${cur === i.slug ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select>`;
    const chk = (name, label, on) => `<label><input type="checkbox" name="${name}" ${on ? 'checked' : ''}> ${label}</label>`;
    openDlg(`<form id="pform"><h2 style="margin-top:0">${id ? 'Editar producto' : 'Nuevo producto'}</h2>
      <div class="grid2">
        <label>Nombre<input name="name" placeholder="Ej. Collar arcoíris" required maxlength="120" value="${esc(p.name)}"></label>
        <label>Subtítulo<input name="subtitle" placeholder="Ej. Hecho a mano para tu mascota" maxlength="160" value="${esc(p.subtitle)}"></label>
        <label>Precio regular (USD)<input name="price" type="number" min="0" step="0.01" required value="${(p.priceCents / 100).toFixed(2)}"></label>
        <label>Stock<input name="stock" type="number" min="0" step="1" required value="${p.stock}"></label>
        <label>Categoría${sel('category', META.categories, p.category)}</label>
        <label>Tipo${sel('type', META.types, p.type, '—')}</label>
        <label>Colección${sel('collection', META.collections, p.collection, 'Ninguna')}</label>
        ${p.salePriceCents != null ? `<label>Precio en promoción<input disabled value="${money(p.salePriceCents)} (automático)"></label>` : '<span></span>'}
      </div>
      <label>Descripción<textarea name="description" rows="3" maxlength="2000" placeholder="Ej. Collar cómodo y ajustable, elaborado a mano.">${esc(p.description)}</textarea></label>
      <fieldset><legend>Etiquetas y visibilidad</legend><div class="checks">
        ${chk('isNew', 'Nuevo', p.isNew)}${chk('bestseller', 'Más vendido (portada)', p.bestseller)}${chk('latest', 'Últimos modelos (portada)', p.latest)}${chk('active', 'Visible en la tienda', p.active)}</div></fieldset>
      <fieldset><legend>Tallas</legend><div class="checks">${META.sizes.map((s) => `<label><input type="checkbox" name="size" value="${esc(s)}" ${p.sizes.includes(s) ? 'checked' : ''}> ${esc(s)}</label>`).join('')}</div></fieldset>
      <fieldset><legend>Colores</legend><div id="colors"></div><button type="button" class="btn ghost sm" id="add-color">+ Agregar color</button></fieldset>
      <fieldset><legend>Fotos (la primera es la principal)</legend><div id="images" class="thumbs"></div>
        <div class="pick"><input type="file" id="up" accept="image/jpeg,image/png,image/webp"><span class="muted">o</span>
          <select id="pick"><option value="">Elegir de public/media…</option>${media.map((f) => `<option>${esc(f)}</option>`).join('')}</select><button type="button" class="btn ghost sm" id="add-img">Añadir</button></div></fieldset>
      <fieldset><legend>Secciones de la ficha (Detalles, Cuidados, Envíos…)</legend><div id="sections"></div>
        <button type="button" class="btn ghost sm" id="add-sec">+ Agregar sección</button>${p.sections ? '' : '<p class="muted">Se crearán las secciones estándar al guardar.</p>'}</fieldset>
      <div class="actions"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn" type="submit">Guardar</button></div></form>`);

    const renderColors = () => { $('#colors').innerHTML = draft.colors.map((c, i) => `<div class="color-row"><input type="color" data-i="${i}" data-k="hex" value="${/^#[0-9a-f]{6}$/i.test(c.hex) ? esc(c.hex) : '#000000'}"><input type="text" data-i="${i}" data-k="name" maxlength="40" placeholder="Ej. Rosa pastel" value="${esc(c.name)}"><button type="button" class="btn ghost sm" data-rmcolor="${i}">✕</button></div>`).join('') || '<p class="muted">Sin colores.</p>'; };
    const renderImages = () => { $('#images').innerHTML = draft.images.map((f, i) => `<figure><img src="/media/${esc(f)}" alt=""><button type="button" class="btn ghost sm" data-imv="${i}:-1" ${i === 0 ? 'disabled' : ''}>←</button><button type="button" class="btn ghost sm" data-imv="${i}:1" ${i === draft.images.length - 1 ? 'disabled' : ''}>→</button><button type="button" class="btn ghost sm" data-imrm="${i}">✕</button></figure>`).join('') || '<p class="muted">Sin fotos.</p>'; };
    const renderSecs = () => { $('#sections').innerHTML = draft.sections.map((s, i) => `<details class="sec" ${s.open ? 'open' : ''}><summary>${esc(s.title || 'Nueva sección')}</summary><input data-si="${i}" data-sk="title" maxlength="80" placeholder="Ej. Materiales y cuidados" value="${esc(s.title)}"><textarea data-si="${i}" data-sk="body" rows="3" maxlength="2000" placeholder="Ej. Limpia con un paño húmedo y deja secar al aire.">${esc(s.body)}</textarea><button type="button" class="btn ghost sm" data-rmsec="${i}" style="margin-top:.4rem">Quitar sección</button></details>`).join(''); };
    renderColors(); renderImages(); renderSecs();

    const f = $('#pform');
    f.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.k) draft.colors[+t.dataset.i][t.dataset.k] = t.value;
      if (t.dataset.sk) draft.sections[+t.dataset.si][t.dataset.sk] = t.value;
    });
    f.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'add-color') { draft.colors.push({ id: 0, name: '', hex: '#4adbe0' }); renderColors(); }
      if (b.dataset.rmcolor) { draft.colors.splice(+b.dataset.rmcolor, 1); renderColors(); }
      if (b.dataset.imrm) { draft.images.splice(+b.dataset.imrm, 1); renderImages(); }
      if (b.dataset.imv) { const [i, d] = b.dataset.imv.split(':').map(Number); [draft.images[i], draft.images[i + d]] = [draft.images[i + d], draft.images[i]]; renderImages(); }
      if (b.id === 'add-img' && $('#pick').value) { draft.images.push($('#pick').value); renderImages(); }
      if (b.id === 'add-sec') { if (!draft.sections.length && !p.sections) toast('Al guardar se crearán las secciones estándar; agrégalas luego si quieres más.', true); draft.sections.push({ title: '', body: '', open: false }); renderSecs(); }
      if (b.dataset.rmsec) { draft.sections.splice(+b.dataset.rmsec, 1); renderSecs(); }
    });
    $('#up').addEventListener('change', guard(async (e) => {
      const file = e.target.files[0]; if (!file) return;
      if (file.size > 8 * 1024 * 1024) return toast('La imagen pesa más de 8 MB.', true);
      const { file: name } = await api('/admin/upload', { method: 'POST', raw: file });
      draft.images.push(name); renderImages(); e.target.value = ''; toast('Imagen subida');
    }));
    f.addEventListener('submit', guard(async (e) => {
      e.preventDefault();
      const fd = new FormData(f);
      const body = { name: fd.get('name'), subtitle: fd.get('subtitle'), description: fd.get('description'), price: fd.get('price'), stock: fd.get('stock'),
        category: fd.get('category'), type: fd.get('type'), collection: fd.get('collection'),
        isNew: fd.has('isNew'), bestseller: fd.has('bestseller'), latest: fd.has('latest'), active: fd.has('active'),
        sizes: fd.getAll('size'), images: draft.images, colors: draft.colors,
        sections: p.sections || draft.sections.length ? draft.sections : null };
      await api(id ? '/admin/products/' + id : '/admin/products', { method: id ? 'PUT' : 'POST', body });
      closeDlg(); toast('Producto guardado'); go('productos');
    }));
  }

  /* ───────── Clientes ───────── */
  let cTab = 'usuarios';
  async function vClientes() {
    const d = await api('/admin/customers');
    const tabs = [['usuarios', `Usuarios registrados (${d.users.length})`], ['compradores', `Compradores (${d.buyers.length})`], ['ultimas', 'Últimas compras']];
    let body = '';
    if (cTab === 'usuarios') body = `<div class="scroll"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Registro</th><th class="num">Pedidos</th><th class="num">Gastado</th><th>Última compra</th></tr></thead><tbody>
      ${d.users.map((u) => `<tr><td>${esc(u.name)} ${u.role === 'admin' ? '<span class="badge">Admin</span>' : ''}</td><td>${esc(u.email)}</td><td>${fdate(u.createdAt)}</td><td class="num">${u.orders}</td><td class="num">${money(u.spentCents)}</td><td>${fdate(u.lastOrderAt)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Aún no hay usuarios.</td></tr>'}</tbody></table></div>`;
    if (cTab === 'compradores') body = `<p class="muted">Todas las personas que han hecho un pedido, tengan cuenta o no.</p><div class="scroll"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Teléfono</th><th class="num">Pedidos</th><th class="num">Gastado</th><th>Última compra</th></tr></thead><tbody>
      ${d.buyers.map((b) => `<tr><td>${esc(b.name)} ${b.registered ? '<span class="badge ok">Con cuenta</span>' : ''}</td><td>${esc(b.email)}</td><td>${esc(b.phone || '—')}</td><td class="num">${b.orders}</td><td class="num">${money(b.spentCents)}</td><td>${fdate(b.lastOrderAt)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Aún no hay compras.</td></tr>'}</tbody></table></div>`;
    if (cTab === 'ultimas') body = `<div class="scroll"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Productos</th><th>Estado</th><th class="num">Total</th><th>Fecha</th></tr></thead><tbody>
      ${d.latest.map((o) => `<tr><td><strong>${esc(o.code)}</strong></td><td>${esc(o.customerName)}<br><span class="muted">${esc(o.email)}</span></td><td>${o.items.map((i) => `${i.qty} × ${esc(i.name)}`).join('<br>')}</td><td><span class="badge">${STATUS[o.status]}</span></td><td class="num">${money(o.totalCents)}</td><td>${fdate(o.createdAt)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Aún no hay compras.</td></tr>'}</tbody></table></div>`;
    view.innerHTML = `<h1>Clientes</h1><div class="tabs">${tabs.map(([k, l]) => `<button data-ctab="${k}" class="${cTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>${body}`;
    view.querySelectorAll('[data-ctab]').forEach((b) => { b.onclick = () => { cTab = b.dataset.ctab; vClientes(); }; });
  }

  /* ───────── Colecciones ───────── */
  const move = (ids, i, d) => { const a = [...ids]; [a[i], a[i + d]] = [a[i + d], a[i]]; return a; };
  async function vColecciones() {
    const list = await api('/admin/collections');
    const ids = list.map((c) => c.id);
    view.innerHTML = `<h1>Colecciones</h1><p class="muted">El orden de esta lista es el orden en que aparecen en los filtros de la tienda.</p>
      <div class="bar"><button class="btn" id="c-new">+ Nueva colección</button></div>
      <div class="stack">${list.map((c, i) => `<div class="row"><div class="grow"><strong>${esc(c.name)}</strong> <span class="badge">${c.products} productos</span><br><span class="muted">${esc(c.description || '')}</span></div>
        <div class="acts"><button class="btn ghost sm" data-cup="${i}" ${i === 0 ? 'disabled' : ''}>↑</button><button class="btn ghost sm" data-cdown="${i}" ${i === list.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="btn sm" data-cedit="${c.id}">Editar</button><button class="btn danger sm" data-cdel="${c.id}">Eliminar</button></div></div>`).join('') || '<p class="muted">No hay colecciones.</p>'}</div>`;
    const reorderTo = guard(async (arr) => { await api('/admin/collections/reorder', { method: 'POST', body: { ids: arr } }); META = await api('/admin/meta'); vColecciones(); });
    view.querySelectorAll('[data-cup]').forEach((b) => { b.onclick = () => reorderTo(move(ids, +b.dataset.cup, -1)); });
    view.querySelectorAll('[data-cdown]').forEach((b) => { b.onclick = () => reorderTo(move(ids, +b.dataset.cdown, 1)); });
    const form = (c) => { openDlg(`<form id="cform"><h2 style="margin-top:0">${c ? 'Editar colección' : 'Nueva colección'}</h2>
      <label>Nombre<input name="name" placeholder="Ej. Colección de verano" required maxlength="80" value="${esc(c?.name || '')}"></label><br>
      <label>Descripción<textarea name="description" rows="3" maxlength="300" placeholder="Ej. Diseños coloridos para los días soleados.">${esc(c?.description || '')}</textarea></label>
      <p class="muted">Para meter productos en una colección, elige la colección al editar cada producto.</p>
      <div class="actions"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn" type="submit">Guardar</button></div></form>`);
      $('#cform').onsubmit = guard(async (e) => { e.preventDefault(); const fd = new FormData(e.target);
        await api(c ? '/admin/collections/' + c.id : '/admin/collections', { method: c ? 'PUT' : 'POST', body: { name: fd.get('name'), description: fd.get('description') } });
        closeDlg(); META = await api('/admin/meta'); toast('Colección guardada'); vColecciones(); }); };
    $('#c-new').onclick = () => form(null);
    view.querySelectorAll('[data-cedit]').forEach((b) => { b.onclick = () => form(list.find((c) => c.id == b.dataset.cedit)); });
    view.querySelectorAll('[data-cdel]').forEach((b) => { b.onclick = guard(async () => { if (!confirm('¿Eliminar la colección? Sus productos NO se borran; solo quedan sin colección.')) return;
      await api('/admin/collections/' + b.dataset.cdel, { method: 'DELETE' }); META = await api('/admin/meta'); toast('Colección eliminada'); vColecciones(); }); });
  }

  /* ───────── Promociones ───────── */
  async function vPromociones() {
    const list = await api('/admin/promotions');
    const ids = list.map((p) => p.id);
    const range = (p) => (p.startsAt || p.endsAt ? `${p.startsAt || 'ya'} → ${p.endsAt || 'sin fin'}` : 'Sin fechas');
    view.innerHTML = `<h1>Promociones</h1><p class="muted">Descuento en porcentaje que se aplica solo a los precios de la tienda y de la bolsa. Si un producto entra en varias promociones, gana la que esté más arriba en la lista.</p>
      <div class="bar"><button class="btn" id="pr-new">+ Nueva promoción</button></div>
      <div class="stack">${list.map((p, i) => { const [lab, cls] = PSTATUS[p.status]; return `<div class="row"><div class="grow"><strong>${esc(p.name)}</strong> <span class="badge ${cls}">${lab}</span><br>
        <span class="muted">${p.percent}% · ${SCOPE[p.scope]}${p.scope === 'products' ? ` (${p.productIds.length})` : p.scopeRef ? `: ${esc(p.scopeRef)}` : ''} · ${esc(range(p))}</span></div>
        <div class="acts"><button class="btn ghost sm" data-pup="${i}" ${i === 0 ? 'disabled' : ''}>↑</button><button class="btn ghost sm" data-pdown="${i}" ${i === list.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="btn ghost sm" data-ptoggle="${p.id}:${p.active ? 0 : 1}">${p.active ? 'Pausar' : 'Activar'}</button><button class="btn sm" data-pedit="${p.id}">Editar</button><button class="btn danger sm" data-pdel="${p.id}">Eliminar</button></div></div>`; }).join('') || '<p class="muted">Aún no hay promociones.</p>'}</div>`;
    const reorderTo = guard(async (arr) => { await api('/admin/promotions/reorder', { method: 'POST', body: { ids: arr } }); vPromociones(); });
    view.querySelectorAll('[data-pup]').forEach((b) => { b.onclick = () => reorderTo(move(ids, +b.dataset.pup, -1)); });
    view.querySelectorAll('[data-pdown]').forEach((b) => { b.onclick = () => reorderTo(move(ids, +b.dataset.pdown, 1)); });
    view.querySelectorAll('[data-ptoggle]').forEach((b) => { b.onclick = guard(async () => { const [id, on] = b.dataset.ptoggle.split(':'); await api('/admin/promotions/' + id, { method: 'PATCH', body: { active: on === '1' } }); vPromociones(); }); });
    view.querySelectorAll('[data-pdel]').forEach((b) => { b.onclick = guard(async () => { if (!confirm('¿Eliminar la promoción? Los precios vuelven a su valor regular.')) return; await api('/admin/promotions/' + b.dataset.pdel, { method: 'DELETE' }); toast('Promoción eliminada'); vPromociones(); }); });
    $('#pr-new').onclick = guard(() => promoForm(null));
    view.querySelectorAll('[data-pedit]').forEach((b) => { b.onclick = guard(() => promoForm(list.find((p) => p.id == b.dataset.pedit))); });
  }
  async function promoForm(p) {
    const prods = await api('/admin/products?status=active');
    const cur = p || { name: '', percent: 10, scope: 'products', scopeRef: '', startsAt: '', endsAt: '', active: true, productIds: [] };
    openDlg(`<form id="prform"><h2 style="margin-top:0">${p ? 'Editar promoción' : 'Nueva promoción'}</h2>
      <div class="grid2"><label>Nombre<input name="name" placeholder="Ej. Descuento de temporada" required maxlength="80" value="${esc(cur.name)}"></label><label>Descuento (%)<input name="percent" type="number" min="1" max="90" placeholder="Ej. 15" required value="${cur.percent}"></label>
        <label>Desde (opcional)<input name="startsAt" type="date" value="${esc(cur.startsAt)}"></label><label>Hasta (opcional, inclusive)<input name="endsAt" type="date" value="${esc(cur.endsAt)}"></label></div>
      <label>Aplica a<select name="scope">${Object.entries(SCOPE).map(([k, l]) => `<option value="${k}" ${cur.scope === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div id="sc-category" hidden><br><label>Categoría<select name="cat">${META.categories.map((c) => `<option value="${c.slug}" ${cur.scopeRef === c.slug ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label></div>
      <div id="sc-collection" hidden><br><label>Colección<select name="col">${META.collections.map((c) => `<option value="${c.slug}" ${cur.scopeRef === c.slug ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label></div>
      <div id="sc-products" hidden><br><div class="pickbox">${prods.map((x) => `<label><input type="checkbox" name="pid" value="${x.id}" ${cur.productIds.includes(x.id) ? 'checked' : ''}> ${esc(x.name)} <span class="muted">· ${esc(x.categoryName)}</span></label>`).join('')}</div></div>
      <label style="flex-direction:row;align-items:center;gap:.5rem;margin-top:.8rem;color:var(--ink)"><input type="checkbox" name="active" ${cur.active ? 'checked' : ''}> Promoción activa</label>
      <div class="actions"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn" type="submit">Guardar</button></div></form>`);
    const f = $('#prform');
    const showScope = () => { for (const s of ['category', 'collection', 'products']) $('#sc-' + s).hidden = f.scope.value !== s; };
    f.scope.onchange = showScope; showScope();
    f.onsubmit = guard(async (e) => {
      e.preventDefault(); const fd = new FormData(f); const scope = fd.get('scope');
      const body = { name: fd.get('name'), percent: fd.get('percent'), scope, startsAt: fd.get('startsAt'), endsAt: fd.get('endsAt'), active: fd.has('active'),
        scopeRef: scope === 'category' ? fd.get('cat') : scope === 'collection' ? fd.get('col') : null, productIds: fd.getAll('pid') };
      await api(p ? '/admin/promotions/' + p.id : '/admin/promotions', { method: p ? 'PUT' : 'POST', body });
      closeDlg(); toast('Promoción guardada'); vPromociones();
    });
  }

  /* ───────── Página de ayuda ───────── */
  const HELP_FIELDS = [
    ['Portada', [['info_eyebrow', 'Frase pequeña', 1], ['info_title', 'Título', 1], ['info_intro', 'Texto de presentación', 3]]],
    ['Nuestra historia', [['info_story_title', 'Título', 1], ['info_story_p1', 'Primer párrafo', 3], ['info_story_p2', 'Segundo párrafo', 3], ['info_note_title', 'Recuadro: título', 1], ['info_note_text', 'Recuadro: texto', 3]]],
    ['Preguntas frecuentes (encabezado)', [['info_faq_title', 'Título', 1], ['info_faq_intro', 'Texto', 3]]],
    ['Cierre de la página', [['info_cta_title', 'Título', 1]]],
  ];
  async function vAyuda() {
    const d = await api('/admin/help');
    view.innerHTML = `<h1>Página de ayuda</h1><p class="muted">Lo que cambies aquí se actualiza en <a href="/informacion.html" target="_blank" rel="noopener">informacion.html</a>.</p>
      <form id="hform" class="stack">${HELP_FIELDS.map(([title, fields]) => `<fieldset><legend>${title}</legend><div class="stack">${fields.map(([k, label, rows]) => `<label>${label}${rows > 1 ? `<textarea name="${k}" rows="${rows}" maxlength="1500" placeholder="Ej. Escribe aquí el texto de ${label.toLowerCase()}.">${esc(d.settings[k])}</textarea>` : `<input name="${k}" maxlength="1500" placeholder="Ej. ${label}" value="${esc(d.settings[k])}">`}</label>`).join('')}</div></fieldset>`).join('')}
        <div><button class="btn" type="submit">Guardar textos</button></div></form>
      <h2>Preguntas frecuentes</h2><div class="bar"><button class="btn" id="f-new">+ Nueva pregunta</button></div>
      <div class="stack">${d.faqs.map((q, i) => `<div class="row"><div class="grow"><strong>${esc(q.question)}</strong><br><span class="muted">${esc(q.answer.slice(0, 140))}${q.answer.length > 140 ? '…' : ''}</span></div>
        <div class="acts"><button class="btn ghost sm" data-fup="${i}" ${i === 0 ? 'disabled' : ''}>↑</button><button class="btn ghost sm" data-fdown="${i}" ${i === d.faqs.length - 1 ? 'disabled' : ''}>↓</button><button class="btn sm" data-fedit="${q.id}">Editar</button><button class="btn danger sm" data-fdel="${q.id}">Eliminar</button></div></div>`).join('')}</div>`;
    $('#hform').onsubmit = guard(async (e) => { e.preventDefault(); const body = Object.fromEntries(new FormData(e.target)); await api('/admin/help/settings', { method: 'PUT', body }); toast('Textos guardados'); });
    const ids = d.faqs.map((q) => q.id);
    const reorderTo = guard(async (arr) => { await api('/admin/faqs/reorder', { method: 'POST', body: { ids: arr } }); vAyuda(); });
    view.querySelectorAll('[data-fup]').forEach((b) => { b.onclick = () => reorderTo(move(ids, +b.dataset.fup, -1)); });
    view.querySelectorAll('[data-fdown]').forEach((b) => { b.onclick = () => reorderTo(move(ids, +b.dataset.fdown, 1)); });
    const form = (q) => { openDlg(`<form id="fform"><h2 style="margin-top:0">${q ? 'Editar pregunta' : 'Nueva pregunta'}</h2>
      <label>Pregunta<input name="question" placeholder="Ej. ¿Cómo puedo limpiar el collar?" required maxlength="200" value="${esc(q?.question || '')}"></label><br>
      <label>Respuesta<textarea name="answer" rows="6" required maxlength="2000" placeholder="Ej. Límpialo con un paño húmedo y déjalo secar al aire.">${esc(q?.answer || '')}</textarea></label>
      <div class="actions"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn" type="submit">Guardar</button></div></form>`);
      $('#fform').onsubmit = guard(async (e) => { e.preventDefault(); const fd = new FormData(e.target);
        await api(q ? '/admin/faqs/' + q.id : '/admin/faqs', { method: q ? 'PUT' : 'POST', body: { question: fd.get('question'), answer: fd.get('answer') } }); closeDlg(); toast('Pregunta guardada'); vAyuda(); }); };
    $('#f-new').onclick = () => form(null);
    view.querySelectorAll('[data-fedit]').forEach((b) => { b.onclick = () => form(d.faqs.find((q) => q.id == b.dataset.fedit)); });
    view.querySelectorAll('[data-fdel]').forEach((b) => { b.onclick = guard(async () => { if (!confirm('¿Eliminar esta pregunta?')) return; await api('/admin/faqs/' + b.dataset.fdel, { method: 'DELETE' }); toast('Pregunta eliminada'); vAyuda(); }); });
  }

  boot().catch((e) => { $('#gate').hidden = false; $('#login-error').textContent = e.message; });
})();
