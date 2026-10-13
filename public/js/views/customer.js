// MIJOZ paneli: buyurtmalarni yaratish va kuzatish.
window.TP = window.TP || {};
TP.views = TP.views || {};

TP.views.customer = (function () {
  var h = TP.ui.h, api = TP.api, toast = TP.ui.toast, badge = TP.ui.badge, empty = TP.ui.empty;

  async function orders(c) {
    c.appendChild(h('div', { class: 'page-title' }, 'Buyurtmalarim'));
    c.appendChild(h('a', { class: 'btn btn-primary', href: '#/customer/new' }, '＋ Yangi buyurtma'));
    c.appendChild(h('div', { style: 'height:10px' }));
    var box = h('div', null);
    c.appendChild(box);
    var rows;
    try { rows = await api.get('/api/customer/orders'); }
    catch (e) { box.appendChild(empty(e.message, '⚠️')); return; }
    if (!rows.length) { box.appendChild(empty('Hozircha buyurtmalaringiz yo‘q', '📦')); return; }
    rows.forEach(function (o) {
      box.appendChild(h('div', { class: 'card' },
        h('div', { class: 'task-head' }, h('div', { class: 'task-title' }, '#' + o.id + ' ' + o.title), badge(o.status)),
        h('div', { class: 'task-meta' },
          h('span', null, 'Miqdor: ' + o.qty),
          o.price ? h('span', null, 'Narxi: ' + Number(o.price).toLocaleString('uz-UZ') + ' so‘m') : h('span', { class: 'muted' }, 'Narxi kutilmoqda'),
          o.deadline ? h('span', null, 'Taxminiy muddat: ' + TP.ui.fmtDate(o.deadline)) : null,
          h('span', { class: 'small muted' }, 'Yaratilgan: ' + TP.ui.fmtDate(o.created_at))
        ),
        o.description ? h('div', { class: 'small muted mt8' }, o.description) : null,
        o.photo ? h('img', { class: 'order-photo', src: '/uploads/' + o.photo, alt: 'buyurtma rasmi' }) : null
      ));
    });
  }

  async function newOrder(c) {
    c.appendChild(h('div', { class: 'page-title' }, 'Yangi buyurtma'));
    var tIn = h('input', { placeholder: 'Masalan: erkaklar kostyumi' });
    var dIn = h('textarea', { placeholder: 'O‘lcham, mato, rang va boshqa tafsilotlar…' });
    var qIn = h('input', { type: 'number', min: '1', value: '1' });
    var dlIn = h('input', { type: 'date', min: TP.ui.todayStr() });
    var fIn = h('input', { type: 'file', accept: 'image/*' });
    var preview = h('div', null);
    var photoData = null;
    fIn.addEventListener('change', async function () {
      var f = fIn.files && fIn.files[0];
      if (!f) { photoData = null; preview.textContent = ''; return; }
      try {
        photoData = await TP.ui.readFileAsDataURL(f);
        preview.textContent = '';
        preview.appendChild(h('img', { class: 'order-photo', src: photoData }));
      } catch (e) { toast(e.message, 'err'); }
    });
    var btn = h('button', { class: 'btn btn-primary btn-block' }, 'Buyurtma berish');
    btn.addEventListener('click', async function () {
      if (!tIn.value.trim()) { toast('Buyurtma nomini kiriting', 'err'); return; }
      btn.disabled = true;
      try {
        await api.post('/api/customer/orders', {
          title: tIn.value.trim(), description: dIn.value.trim(),
          qty: Number(qIn.value) || 1, deadline: dlIn.value, photo_data: photoData || undefined,
        });
        toast('Buyurtma qabul qilindi — xodimga biriktirildi', 'ok');
        location.hash = '#/customer/orders';
      } catch (e) { toast(e.message, 'err'); btn.disabled = false; }
    });
    c.appendChild(h('div', { class: 'card' },
      h('div', { class: 'field' }, h('label', null, 'Nomi'), tIn),
      h('div', { class: 'field' }, h('label', null, 'Tavsif'), dIn),
      h('div', { class: 'field' }, h('label', null, 'Miqdor (dona)'), qIn),
      h('div', { class: 'field' }, h('label', null, 'Istalgan muddat'), dlIn),
      h('div', { class: 'field' }, h('label', null, 'Rasm (ixtiyoriy)'), fIn,
        h('div', { class: 'form-hint' }, 'Kamera yoki galereyadan rasm yuklashingiz mumkin')),
      h('div', { class: 'form-hint' }, 'Yuborilgach buyurtma mavjud faol xodimga avtomatik biriktiriladi va holatini «Buyurtmalarim»da kuzatasiz'),
      preview, btn
    ));
  }

  return {
    sections: {
      orders: orders,
      new: newOrder,
      notifications: TP.views.notifications,
      profile: TP.views.profile,
    },
    drawerItems: [
      { hash: '#/customer/orders', label: 'Buyurtmalarim', icon: '📦' },
      { hash: '#/customer/new', label: 'Yangi buyurtma', icon: '➕' },
      { hash: '#/customer/notifications', label: 'Bildirishnomalar', icon: '🔔' },
      { hash: '#/customer/profile', label: 'Shaxsiy profil', icon: '👤' },
    ],
    navItems: [
      { hash: '#/customer/orders', label: 'Buyurtmalar', icon: '📦' },
      { hash: '#/customer/new', label: 'Yangi', icon: '➕' },
      { hash: '#/customer/notifications', label: 'Xabarlar', icon: '🔔' },
      { hash: '#/customer/profile', label: 'Profil', icon: '👤' },
    ],
  };
})();
