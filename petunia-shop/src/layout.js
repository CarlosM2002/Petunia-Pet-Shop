/* Cabecera y pie de página generados en el servidor con los datos de la base. */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderHeader(site, current) {
  const msg = esc(site.settings.announcement);
  const track = Array.from({ length: 8 }, () => `<span>${msg}</span>`).join('');
  const nav = site.nav.map((n) =>
    `<a href="${esc(n.href)}"${n.href === current ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`).join('\n          ');
  return `    <div class="announcement" aria-label="${msg}"><div class="announcement-track">${track}</div></div>
    <header class="site-header">
      <div class="navigation">
        <a class="brand" href="index.html" aria-label="${esc(site.settings.brand_name)}, ir al inicio">
          <img class="brand-mark" src="media/logo-mark.png" alt="" />
          <img class="brand-word" src="media/logo-word.png" alt="${esc(site.settings.brand_name)}" />
        </a>
        <nav aria-label="Navegación principal">
          ${nav}
        </nav>
        <div class="header-tools" aria-label="Accesos de usuario">
          <a href="search.html" aria-label="Buscar"><img src="media/search.svg" alt="" /></a>
          <button type="button" id="btn-account" aria-label="Mi cuenta"><img src="media/profile.svg" alt="" /></button>
          <button type="button" id="btn-favorites" aria-label="Favoritos"><img src="media/favorite-header.svg" alt="" /><span class="bag-count" id="fav-count" hidden>0</span></button>
          <button type="button" id="btn-cart" aria-label="Bolsa de compras"><img src="media/shopping-bag.svg" alt="" /><span class="bag-count" id="bag-count" hidden>0</span></button>
        </div>
      </div>
    </header>`;
}

function renderFooter(site) {
  const s = site.settings;
  const cols = site.footerColumns.map((c) => `          <div class="footer-col">
            <h2>${esc(c.title)}</h2>
            ${c.links.map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join('\n            ')}
          </div>`).join('\n');
  const social = site.social.map((l) =>
    `<a href="${esc(l.url)}" aria-label="${esc(l.network)}"><img src="media/${esc(l.icon)}" alt="" /></a>`).join('\n            ');
  return `    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div class="newsletter">
            <h2>${esc(s.newsletter_title)}</h2>
            <form id="newsletter-form">
              <label class="sr-only" for="email">Correo electrónico</label>
              <input id="email" name="email" type="email" placeholder="Tu correo electrónico" required />
              <button type="submit" aria-label="Enviar correo"><img src="media/arrow-forward.svg" alt="" /></button>
            </form>
            <label class="consent">
              <input type="checkbox" name="consent" form="newsletter-form" />
              <span>${esc(s.newsletter_consent)}</span>
            </label>
          </div>
${cols}
        </div>
        <div class="footer-bottom">
          <p class="copyright"><img src="media/copyright.svg" alt="" />${esc(s.copyright)}</p>
          <div class="footer-social" aria-label="Redes sociales">
            ${social}
          </div>
        </div>
      </div>
    </footer>
    <button class="chat-button" id="btn-chat" type="button" aria-label="Abrir chat"><img src="media/chat.svg" alt="" /></button>`;
}

module.exports = { renderHeader, renderFooter, esc };
