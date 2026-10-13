// Barcha rollar uchun umumiy ko'rinishlar: bildirishnomalar va profil.
window.TP = window.TP || {};
TP.views = TP.views || {};

(function () {
  var h = TP.ui.h, api = TP.api, toast = TP.ui.toast, fmt = TP.ui.fmtDateTime;

  TP.views.notifications = async function (container) {
    container.appendChild(h('div', { class: 'page-title' }, 'Bildirishnomalar'));
    var listWrap = h('div', { class: 'card' }, h('p', { class: 'muted' }, 'Yuklanmoqda…'));
    container.appendChild(listWrap);
    var items;
    try {
      items = await api.get('/api/notifications');
    } catch (e) {
      listWrap.textContent = '';
      listWrap.appendChild(TP.ui.empty(e.message, '⚠️'));
      return;
    }
    listWrap.textContent = '';
    if (!items.length) {
      listWrap.appendChild(TP.ui.empty('Bildirishnomalar yo‘q', '🔔'));
      return;
    }
    var hasUnread = items.some(function (n) { return !n.is_read; });
    if (hasUnread) {
      container.insertBefore(h('div', { class: 'row mb12' },
        h('span', { class: 'grow small muted' }, "O'qilmaganlar: " + items.filter(function (n) { return !n.is_read; }).length + ' ta'),
        h('button', {
          class: 'btn btn-sm btn-soft',
          onclick: async function (ev) {
            ev.target.disabled = true;
            try { await api.post('/api/notifications/read', {}); TP.app.refreshUnread(); TP.app.rerender(); }
            catch (e) { toast(e.message, 'err'); }
          },
        }, "Barchasini o'qish")
      ), listWrap);
    }
    items.forEach(function (n) {
      listWrap.appendChild(h('div', { class: 'notif-item' + (n.is_read ? ' read' : '') },
        h('span', { class: 'dot' }),
        h('div', { class: 'grow' },
          h('div', { class: 't' }, n.title),
          n.body ? h('div', { class: 'b' }, n.body) : null,
          h('div', { class: 'tl-meta' }, fmt(n.created_at)))
      ));
    });
  };

  TP.views.profile = async function (container) {
    var user = TP.app.state.user;
    container.appendChild(h('div', { class: 'page-title' }, 'Shaxsiy profil'));
    var initials = (user.name || '?').trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
    var card = h('div', { class: 'card', style: 'text-align:center' },
      h('div', { class: 'avatar-lg' }, initials),
      h('div', { style: 'font-weight:700;font-size:16px' }, user.name),
      h('div', { class: 'muted small' }, 'Login: ' + user.login),
      h('div', { class: 'muted small' }, 'Rol: ' + ({ admin: 'Administrator', employee: 'Xodim', customer: 'Mijoz' })[user.role]),
      user.position ? h('div', { class: 'muted small' }, 'Lavozim: ' + user.position) : null
    );
    container.appendChild(card);

    var nameInput = h('input', { type: 'text', value: user.name });
    var passInput = h('input', { type: 'password', placeholder: 'Yangi parol (ixtiyoriy)' });
    var form = h('div', { class: 'card' },
      h('div', { class: 'section-title' }, 'Ma\'lumotlarni o‘zgartirish'),
      h('div', { class: 'field' }, h('label', null, 'Ism familiya'), nameInput,
        user.name === user.login ? h('div', { class: 'form-hint' }, 'Hisobingiz telefon raqami bilan yaratilgan — ismingizni yozib saqlang.') : null),
      h('div', { class: 'field' }, h('label', null, 'Yangi parol'), passInput,
        h('div', { class: 'form-hint' }, "Bo'sh qoldirsangiz, parol o'zgarmaydi")),
      h('button', {
        class: 'btn btn-primary btn-block',
        onclick: async function (ev) {
          ev.target.disabled = true;
          try {
            var body = { name: nameInput.value.trim() };
            if (passInput.value) body.password = passInput.value;
            var res = await api.put('/api/me', body);
            TP.app.state.user = res.user;
            toast('Saqlandi', 'ok');
            TP.app.rerender();
          } catch (e) { toast(e.message, 'err'); }
          ev.target.disabled = false;
        },
      }, 'Saqlash')
    );
    container.appendChild(form);

    // Native ilova uchun server manzili sozlamasi
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      var urlInput = h('input', { type: 'text', value: api.getServerUrl() });
      container.appendChild(h('div', { class: 'card' },
        h('div', { class: 'section-title' }, 'Server manzili (mobil ilova)'),
        h('div', { class: 'field' }, h('label', null, 'API URL'), urlInput),
        h('button', {
          class: 'btn btn-soft btn-block',
          onclick: function () {
            api.setServerUrl(urlInput.value.trim().replace(/\/+$/, ''));
            toast('Server manzili saqlandi', 'ok');
          },
        }, 'Manzilni saqlash')
      ));
    }

    container.appendChild(h('button', {
      class: 'btn btn-danger btn-block',
      onclick: function () { TP.app.logout(); },
    }, 'Tizimdan chiqish'));
  };
})();
