// Ilova yadrosi: sessiya, marshrutlash, layout (topbar/drawer/bottom-nav), onlayn-holat, SW ro'yxati.
window.TP = window.TP || {};

TP.app = (function () {
  var h = TP.ui.h;
  var state = { user: null, unread: 0 };
  var contentEl = null;

  // ---------- Sessiya ----------
  function setUser(user) {
    state.user = user;
    var home = { admin: '#/admin', employee: '#/employee', customer: '#/customer/orders' }[user.role];
    if (!location.hash || location.hash === '#/login') location.hash = home;
    route();
    refreshUnread();
  }

  function onUnauthorized() {
    state.user = null;
    localStorage.removeItem('tp_token');
    location.hash = '#/login';
  }

  async function logout() {
    try { await TP.api.post('/api/auth/logout'); } catch (e) { /* tiniq chiqish */ }
    localStorage.removeItem('tp_token');
    state.user = null;
    location.hash = '#/login';
    route();
  }

  async function initSession() {
    if (!localStorage.getItem('tp_token')) return;
    try {
      var res = await TP.api.get('/api/me');
      state.user = res.user;
      state.unread = res.unread;
    } catch (e) { /* token eskirgan */ }
  }

  function refreshUnread() {
    if (!state.user) return;
    TP.api.get('/api/me').then(function (res) {
      state.unread = res.unread;
      var dot = document.querySelector('.badge-dot');
      if (dot) {
        dot.textContent = String(res.unread);
        dot.style.display = res.unread > 0 ? 'flex' : 'none';
      }
    }).catch(function () { /* jim */ });
  }

  // ---------- Marshrutlar ----------
  var ROLE_HOME = { admin: '#/admin', employee: '#/employee', customer: '#/customer/orders' };

  function route() {
    var app = document.getElementById('app');
    app.textContent = '';
    var hash = location.hash || '#/';

    if (!state.user) {
      if (hash !== '#/privacy') { TP.views.auth(app); return; }
    }

    var role = state.user && state.user.role;
    var view = null; // {module, sectionKey}
    var parts = hash.replace(/^#\//, '').split('/'); // ["employee","tasks"]

    if (parts[0] === 'privacy') { renderStatic(app); return; }

    if (!role || parts[0] !== role) {
      location.hash = ROLE_HOME[role] || '#/login';
      return;
    }

    var mod = TP.views[role];
    var sectionKey = parts[1] || (role === 'admin' ? 'dashboard' : role === 'employee' ? 'dashboard' : 'orders');
    if (!mod.sections[sectionKey]) sectionKey = (role === 'customer') ? 'orders' : 'dashboard';
    renderShell(app, mod, hash, sectionKey);
  }

  function renderStatic(app) {
    fetch('/privacy.html').then(function (r) { return r.text(); }).then(function (html) {
      var w = h('div', { class: 'layout' });
      w.appendChild(h('div', { class: 'topbar' }, h('a', { class: 'brand', href: '#/' }, '← TIKUV PRO')));
      var c = h('div', { class: 'content', html: html });
      w.appendChild(c);
      app.textContent = '';
      app.appendChild(w);
    });
  }

  function renderShell(app, mod, hash, sectionKey) {
    var drawerOverlay = h('div', { class: 'drawer-overlay' });
    var drawer = h('div', { class: 'drawer' });
    function closeDrawer() { drawer.classList.remove('open'); drawerOverlay.classList.remove('open'); }

    var user = state.user;
    var initials = (user.name || '?').trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
    drawer.appendChild(h('div', { class: 'drawer-head' },
      h('div', { class: 'avatar' }, initials),
      h('div', null,
        h('div', { class: 'who' }, user.name),
        h('div', { class: 'role' }, ({ admin: 'Administrator', employee: 'Xodim', customer: 'Mijoz' })[user.role] + (user.position ? ' • ' + user.position : '')))
    ));
    mod.drawerItems.forEach(function (item) {
      var a = h('a', { href: item.hash }, h('span', null, item.icon), item.label);
      var isActive = hash === item.hash || (item.hash !== ROLE_HOME[user.role] && hash.indexOf(item.hash + '/') === 0);
      if (isActive) a.classList.add('active');
      a.addEventListener('click', closeDrawer);
      drawer.appendChild(a);
    });
    drawer.appendChild(h('div', { class: 'drawer-foot' },
      h('a', { href: '#/privacy' }, h('span', null, '🛡️'), 'Maxfiylik siyosati'),
      h('a', { href: '#/', onclick: function (e) { e.preventDefault(); logout(); } }, h('span', null, '🚪'), 'Tizimdan chiqish')
    ));
    drawerOverlay.addEventListener('click', closeDrawer);

    var bell = h('button', { class: 'icon-btn', onclick: function () { location.hash = '/' + user.role + '/notifications'; }, 'aria-label': 'Bildirishnomalar' }, '🔔');
    var dot = h('span', { class: 'badge-dot', style: state.unread > 0 ? '' : 'display:none' }, String(state.unread));
    bell.appendChild(dot);

    var topbar = h('div', { class: 'topbar' },
      h('button', { class: 'icon-btn', onclick: function () { drawer.classList.add('open'); drawerOverlay.classList.add('open'); } }, '☰'),
      h('a', { class: 'brand', href: ROLE_HOME[user.role] }, 'TIKUV PRO'),
      h('span', { class: 'spacer' }),
      bell
    );

    contentEl = h('div', { class: 'content' });
    var nav = h('div', { class: 'bottom-nav' });
    mod.navItems.forEach(function (item) {
      var a = h('a', { href: item.hash },
        h('span', { class: 'nv-ic' }, item.icon), item.label);
      if (hash === item.hash) a.classList.add('active');
      nav.appendChild(a);
    });

    var layout = h('div', { class: 'layout' }, topbar, contentEl, nav);
    app.appendChild(layout);
    app.appendChild(drawerOverlay);
    app.appendChild(drawer);

    Promise.resolve(mod.sections[sectionKey](contentEl)).catch(function (e) {
      if (window.console && console.error) console.error('Section render error:', e);
      contentEl.textContent = '';
      contentEl.appendChild(h('div', { class: 'card', style: 'text-align:center' },
        h('div', { class: 'big' }, '⚠️'),
        h('p', null, 'Bu bo‘limni yuklab bo‘lmadi. Sahifani yangilab qayta urinib ko‘ring.'),
        h('button', { class: 'btn btn-primary', onclick: function () { rerender(); } }, 'Qayta urinish')
      ));
    });
  }

  function rerender() { route(); refreshUnread(); }

  // ---------- Onlayn holat ----------
  function setupConnectivity() {
    function update() {
      var old = document.querySelector('.offline-banner');
      if (old) old.remove();
      if (!navigator.onLine) {
        var layout = document.querySelector('.layout');
        if (layout) layout.insertBefore(h('div', { class: 'offline-banner' }, '📴 Internet aloqasi yo‘q. Ko‘rsatilayotgan ma\'lumotlar oxirgi yuklangan holat.'), layout.firstChild);
      }
    }
    window.addEventListener('offline', update);
    window.addEventListener('online', function () {
      update();
      TP.ui.toast('Internet tiklandi, ma\'lumotlar yangilanmoqda…', 'ok');
      rerender();
    });
    update();
  }

  // ---------- Service Worker (PWA) ----------
  function setupSW() {
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('/sw.js').catch(function () { /* jim */ });
    }
  }

  // ---------- Push (native ilovada, mavjud bo'lsa) ----------
  function setupPush() {
    if (!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) return;
    try {
      var cap = window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
      if (!cap) return;
      cap.requestPermissions().then(function (res) {
        if (res.receive === 'granted') cap.register();
      }).catch(function () { /* ruxsat berilmagan */ });
    } catch (e) { /* plagin o'rnatilmagan */ }
  }

  // ---------- Start ----------
  async function boot() {
    window.addEventListener('hashchange', route);
    setupConnectivity();
    await initSession();
    route();
    refreshUnread();
    setupSW();
    setupPush();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return {
    state: state, setUser: setUser, logout: logout, route: route, rerender: rerender,
    onUnauthorized: onUnauthorized, refreshUnread: refreshUnread,
  };
})();
