// ADMIN paneli: boshqaruv dashboardi, xodimlar, vazifalar, buyurtmalar, mijozlar, materiallar.
window.TP = window.TP || {};
TP.views = TP.views || {};

TP.views.admin = (function () {
  var h = TP.ui.h, api = TP.api, toast = TP.ui.toast, badge = TP.ui.badge, empty = TP.ui.empty;

  function field(label, node, hint) {
    return h('div', { class: 'field' }, h('label', null, label), node, hint ? h('div', { class: 'form-hint' }, hint) : null);
  }
  function input(attrs) { return h('input', Object.assign({ type: 'text' }, attrs)); }

  // ---------- Dashboard ----------
  async function dashboard(c) {
    c.appendChild(h('div', { class: 'page-title' }, 'Boshqaruv paneli'));
    var s;
    try { s = await api.get('/api/admin/stats'); }
    catch (e) { c.appendChild(empty(e.message, '⚠️')); return; }
    var rev = s.ordersByStatus.filter(function (o) { return o.status === 'delivered' || o.status === 'ready'; })
      .reduce(function (a, o) { return a + o.sum; }, 0);
    c.appendChild(h('div', { class: 'stat-grid' },
      scard(s.counts.orders, 'Jami buyurtmalar', 'c-blue'),
      scard(s.counts.newOrders, 'Yangi buyurtmalar', 'c-amber'),
      scard(s.counts.readyOrders, 'Tayyor buyurtmalar', 'c-violet'),
      scard(s.counts.employees, 'Faol xodimlar', 'c-teal'),
      scard(s.counts.customers, 'Mijozlar', 'c-teal'),
      scard(rev.toLocaleString('uz-UZ') + ' so‘m', 'Tayyor/yetkazilgan summasi', 'c-green')
    ));
    c.appendChild(h('a', { class: 'btn btn-primary', href: '#/admin/tasks', style: 'margin-bottom:6px' }, 'Vazifalarni boshqarish'));
    c.appendChild(h('div', { class: 'section-title' }, 'Buyurtmalar holati bo‘yicha'));
    var box = h('div', { class: 'card' });
    if (!s.ordersByStatus.length) box.appendChild(h('p', { class: 'muted' }, 'Buyurtmalar hozircha yo‘q.'));
    s.ordersByStatus.forEach(function (o) {
      box.appendChild(h('div', { class: 'row', style: 'padding:6px 0;border-bottom:1px solid var(--border)' },
        badge(o.status), h('span', { class: 'grow' }, ''),
        h('span', { class: 'small' }, o.c + ' ta • ' + o.sum.toLocaleString('uz-UZ') + ' so‘m')));
    });
    c.appendChild(box);
  }
  function scard(num, label, cls) {
    return h('div', { class: 'stat-card ' + cls }, h('div', { class: 'num' }, String(num)), h('div', { class: 'lbl' }, label));
  }

  // ---------- Xodimlar ----------
  async function employees(c) {
    c.appendChild(h('div', { class: 'page-title' }, 'Xodimlar'));
    var list = h('div', null);
    c.appendChild(list);

    var lIn = input({ placeholder: 'login (masalan: dilshod)' });
    var nIn = input({ placeholder: 'Ism familiya' });
    var pIn = input({ type: 'password', placeholder: 'Boshlang‘ich parol' });
    var posIn = input({ placeholder: 'Lavozim (masalan: Tikuvchi)' });
    var addBtn = h('button', { class: 'btn btn-primary' }, 'Xodim qo‘shish');
    addBtn.addEventListener('click', async function () {
      addBtn.disabled = true;
      try {
        await api.post('/api/admin/employees', { login: lIn.value.trim(), name: nIn.value.trim(), password: pIn.value, position: posIn.value.trim() });
        toast('Xodim qo‘shildi', 'ok'); rerender();
      } catch (e) { toast(e.message, 'err'); addBtn.disabled = false; }
    });
    c.appendChild(h('div', { class: 'card' },
      h('div', { class: 'section-title' }, 'Yangi xodim yaratish'),
      field('Login', lIn), field('Ism familiya', nIn), field('Parol', pIn), field('Lavozim', posIn), addBtn,
      h('p', { class: 'form-hint mt8' }, 'Xodimlar faqat shu yerda yaratilgan hisob orqali kiradi — mijoz o‘zini xodim qila olmaydi.')
    ));

    var rows;
    try { rows = await api.get('/api/admin/employees'); }
    catch (e) { list.appendChild(empty(e.message, '⚠️')); return; }
    if (!rows.length) { list.appendChild(empty('Xodimlar yo‘q', '👥')); return; }
    rows.forEach(function (e2) {
      var toggle = h('button', { class: 'btn btn-sm ' + (e2.active ? 'btn-warn' : 'btn-primary') },
        e2.active ? 'Faolsizlantirish' : 'Faollashtirish');
      toggle.addEventListener('click', function () {
        TP.ui.confirmDlg('«' + e2.name + '» holatini o‘zgartirasizmi?', async function () {
          try { await api.put('/api/admin/employees/' + e2.id, { active: !e2.active }); toast('Yangilandi', 'ok'); rerender(); }
          catch (err) { toast(err.message, 'err'); }
        }, !e2.active);
      });
      var resetBtn = h('button', { class: 'btn btn-sm btn-ghost' }, 'Parolni tiklash');
      resetBtn.addEventListener('click', function () {
        var np = input({ type: 'password', placeholder: 'Yangi parol' });
        var body = h('div', null, field('Yangi parol', np),
          h('button', {
            class: 'btn btn-primary btn-block',
            onclick: async function (ev) {
              try { await api.put('/api/admin/employees/' + e2.id, { password: np.value }); close(); toast('Parol yangilandi', 'ok'); }
              catch (err) { toast(err.message, 'err'); }
            },
          }, 'Saqlash'));
        var close = TP.ui.modal('Parolni tiklash — ' + e2.name, body);
      });
      list.appendChild(h('div', { class: 'card' },
        h('div', { class: 'task-head' },
          h('div', { class: 'task-title' }, e2.name, ' ', e2.active ? h('span', { class: 'badge approved' }, 'faol') : h('span', { class: 'badge rejected' }, 'nofaol')),
        ),
        h('div', { class: 'task-meta' },
          h('span', null, 'Login: ' + e2.login),
          e2.position ? h('span', null, e2.position) : null,
          h('span', null, 'Jarayondagi vazifalar: ' + e2.active_tasks),
          h('span', null, 'Bajarilgan: ' + e2.done_tasks)
        ),
        h('div', { class: 'task-actions' }, toggle, resetBtn)
      ));
    });
  }

  // ---------- Vazifalar ----------
  async function tasks(c) {
    c.appendChild(h('div', { class: 'page-title' }, 'Vazifalar'));
    var emps = await api.get('/api/admin/employees');
    var activeEmps = emps.filter(function (e) { return e.active; });
    var orders = await api.get('/api/admin/orders');

    // Yangi vazifa formasi
    var empSel = h('select', null, activeEmps.map(function (e) { return h('option', { value: e.id }, e.name + (e.position ? ' — ' + e.position : '')); }));
    var ordSel = h('select', null,
      h('option', { value: '' }, '— Buyurtmasiz —'),
      orders.filter(function (o) { return o.status !== 'cancelled' && o.status !== 'delivered'; })
        .map(function (o) { return h('option', { value: o.id }, '#' + o.id + ' ' + o.title); }));
    var tIn = input({ placeholder: 'Vazifa nomi' });
    var dIn = input({ placeholder: 'Tavsif (ixtiyoriy)' });
    var qIn = input({ type: 'number', min: '1', value: '1', placeholder: 'Miqdor' });
    var uIn = input({ placeholder: 'O‘lchov birligi', value: 'dona' });
    var dlIn = input({ type: 'date' });
    var addBtn = h('button', { class: 'btn btn-primary' }, 'Vazifa biriktirish');
    addBtn.addEventListener('click', async function () {
      addBtn.disabled = true;
      try {
        await api.post('/api/admin/tasks', {
          employee_id: Number(empSel.value), order_id: ordSel.value ? Number(ordSel.value) : undefined,
          title: tIn.value.trim(), description: dIn.value.trim(), qty: Number(qIn.value) || 1,
          unit: uIn.value.trim() || 'dona', deadline: dlIn.value,
        });
        toast('Vazifa biriktirildi', 'ok'); rerender();
      } catch (e) { toast(e.message, 'err'); addBtn.disabled = false; }
    });
    c.appendChild(h('div', { class: 'card' },
      h('div', { class: 'section-title' }, 'Yangi vazifa biriktirish'),
      field('Xodim', empSel), field('Buyurtma', ordSel), field('Vazifa nomi', tIn),
      field('Tavsif', dIn), field('Miqdor', qIn), field('Birlik', uIn), field('Topshirish muddati', dlIn),
      addBtn
    ));

    // Vazifalar ro'yxati
    var filter = 'all';
    var tabs = h('div', { class: 'tabs' });
    var box = h('div', null);
    c.appendChild(tabs); c.appendChild(box);

    var defs = [
      ['all', 'Barchasi'], ['assigned', 'Yuborilgan'], ['accepted', 'Qabul qilingan'],
      ['in_progress', 'Jarayonda'], ['approved', 'Bajarilgan'],
    ];
    defs.forEach(function (d) {
      var b = h('button', { onclick: function () { filter = d[0]; sync(); load(); } }, d[1]);
      tabs.appendChild(b);
    });
    function sync() {
      Array.prototype.forEach.call(tabs.children, function (b, i) { b.classList.toggle('active', defs[i][0] === filter); });
    }
    async function load() {
      box.textContent = '';
      box.appendChild(h('p', { class: 'muted' }, 'Yuklanmoqda…'));
      var all = await api.get('/api/admin/tasks');
      var rows = filter === 'all' ? all : all.filter(function (t) { return t.status === filter; });
      box.textContent = '';
      if (!rows.length) { box.appendChild(empty('Vazifalar yo‘q', '📋')); return; }
      rows.forEach(function (t) { box.appendChild(adminTaskCard(t, activeEmps, load)); });
    }
    sync(); await load();
  }

  function adminTaskCard(t, activeEmps, reload) {
    var pct = t.qty > 0 ? Math.round((t.done_qty / t.qty) * 100) : 0;
    var actions = h('div', { class: 'task-actions' });

    // Qayta taqsimlash
    var reSel = h('select', null, activeEmps.map(function (e) { return h('option', { value: e.id, selected: e.id === t.employee_id ? 'selected' : null }, e.name); }));
    var reBtn = h('button', { class: 'btn btn-sm btn-ghost' }, 'Qayta taqsimlash');
    reBtn.addEventListener('click', function () {
      var newId = Number(reSel.value);
      if (newId === t.employee_id) { toast('Xodim o‘zgarmadi', 'err'); return; }
      TP.ui.confirmDlg('Vazifa boshqa xodimga o‘tkazilsinmi? (Holat "yuborilgan"ga qaytadi)', async function () {
        try { await api.patch('/api/admin/tasks/' + t.id, { employee_id: newId }); toast('Qayta taqsimlandi', 'ok'); reload(); }
        catch (e) { toast(e.message, 'err'); }
      });
    });
    if (t.status !== 'approved') actions.appendChild(h('span', { class: 'row', style: 'gap:6px' }, reSel, reBtn));

    return h('div', { class: 'card' },
      h('div', { class: 'task-head' }, h('div', { class: 'task-title' }, t.title), badge(t.status)),
      h('div', { class: 'task-meta' },
        h('span', null, 'Xodim: ' + t.employee_name),
        t.customer_name ? h('span', null, 'Mijoz: ' + t.customer_name) : null,
        t.order_title ? h('span', null, 'Buyurtma: ' + t.order_title) : null,
        h('span', null, t.done_qty + '/' + t.qty + ' ' + t.unit),
        t.deadline ? h('span', null, 'Muddat: ' + TP.ui.fmtDate(t.deadline)) : null
      ),
      h('div', { class: 'progress-track' }, h('div', { class: 'progress-fill', style: 'width:' + pct + '%' })),
      actions.childNodes.length ? actions : null
    );
  }

  // ---------- Buyurtmalar ----------
  async function orders(c) {
    c.appendChild(h('div', { class: 'page-title' }, 'Buyurtmalar'));
    var custs = await api.get('/api/admin/customers');
    var cSel = h('select', null, custs.map(function (x) { return h('option', { value: x.login }, x.name + ' (' + x.login + ')'); }));
    var oT = input({ placeholder: 'Buyurtma nomi' });
    var oD = input({ placeholder: 'Tavsif' });
    var oQ = input({ type: 'number', min: '1', value: '1' });
    var oP = input({ type: 'number', min: '0', placeholder: 'Narxi (so‘m)' });
    var oDl = input({ type: 'date' });
    var addB = h('button', { class: 'btn btn-primary' }, 'Buyurtma yaratish');
    addB.addEventListener('click', async function () {
      addB.disabled = true;
      try {
        await api.post('/api/admin/orders', {
          customer_login: cSel.value, title: oT.value.trim(), description: oD.value.trim(),
          qty: Number(oQ.value) || 1, price: Number(oP.value) || 0, deadline: oDl.value,
        });
        toast('Buyurtma yaratildi — xodimga biriktirildi', 'ok'); rerender();
      } catch (e) { toast(e.message, 'err'); addB.disabled = false; }
    });
    c.appendChild(h('div', { class: 'card' },
      h('div', { class: 'section-title' }, 'Mijoz nomidan buyurtma yaratish'),
      field('Mijoz', cSel), field('Nomi', oT), field('Tavsif', oD), field('Miqdor', oQ),
      field('Narxi', oP), field('Muddat', oDl), addB,
      h('p', { class: 'form-hint mt8' }, 'Buyurtma yaratilgach eng kam yuklangan faol xodimga avtomatik biriktiriladi. Xohlasangiz, keyin «Vazifalar»da qo‘lda o‘zgartirasiz.')
    ));

    var box = h('div', null);
    c.appendChild(box);
    var rows;
    try { rows = await api.get('/api/admin/orders'); }
    catch (e) { box.appendChild(empty(e.message, '⚠️')); return; }
    if (!rows.length) { box.appendChild(empty('Buyurtmalar yo‘q', '📦')); return; }
    var statuses = ['new', 'in_progress', 'ready', 'delivered', 'cancelled'];
    rows.forEach(function (o) {
      var stSel = h('select', { style: 'padding:6px 8px;border:1px solid var(--border);border-radius:8px' },
        statuses.map(function (s) { return h('option', { value: s, selected: o.status === s ? 'selected' : null }, TP.ui.statusLabel(s)); }));
      stSel.addEventListener('change', async function () {
        try { await api.patch('/api/admin/orders/' + o.id, { status: stSel.value }); toast('Holat yangilandi', 'ok'); }
        catch (e) { toast(e.message, 'err'); }
      });
      var pIn = input({ type: 'number', min: '0', value: String(o.price), style: 'width:110px' });
      var pBtn = h('button', { class: 'btn btn-sm btn-soft' }, 'Narx');
      pBtn.addEventListener('click', async function () {
        try { await api.patch('/api/admin/orders/' + o.id, { price: Number(pIn.value) || 0 }); toast('Narx saqlandi', 'ok'); }
        catch (e) { toast(e.message, 'err'); }
      });
      box.appendChild(h('div', { class: 'card' },
        h('div', { class: 'task-head' }, h('div', { class: 'task-title' }, '#' + o.id + ' ' + o.title), badge(o.status)),
        h('div', { class: 'task-meta' },
          h('span', null, 'Mijoz: ' + o.customer_name),
          h('span', null, 'Miqdor: ' + o.qty),
          h('span', null, 'Ishlab chiqarish: ' + o.done_qty + '/' + o.task_qty),
          o.deadline ? h('span', null, 'Muddat: ' + TP.ui.fmtDate(o.deadline)) : null
        ),
        o.description ? h('div', { class: 'small muted mt8' }, o.description) : null,
        o.photo ? h('img', { class: 'order-photo', src: '/uploads/' + o.photo, alt: 'buyurtma rasmi' }) : null,
        h('div', { class: 'task-actions mt12' },
          h('span', { class: 'row', style: 'gap:6px' }, h('span', { class: 'small muted' }, 'Holat:'), stSel),
          h('span', { class: 'row', style: 'gap:6px' }, pIn, pBtn)
        )
      ));
    });
  }

  // ---------- Mijozlar ----------
  async function customers(c) {
    c.appendChild(h('div', { class: 'page-title' }, 'Mijozlar'));
    var box = h('div', null);
    c.appendChild(box);
    var rows;
    try { rows = await api.get('/api/admin/customers'); }
    catch (e) { box.appendChild(empty(e.message, '⚠️')); return; }
    if (!rows.length) { box.appendChild(empty('Mijozlar yo‘q', '👥')); return; }
    var tb = h('tbody', null);
    rows.forEach(function (x) {
      tb.appendChild(h('tr', null,
        h('td', null, x.name), h('td', null, x.login), h('td', null, String(x.orders)),
        h('td', null, TP.ui.fmtDate(x.created_at))));
    });
    box.appendChild(h('div', { class: 'tbl-wrap' },
      h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, h('th', null, 'Ism'), h('th', null, 'Login'), h('th', null, 'Buyurtmalar'), h('th', null, "Ro'yxatdan o'tgan"))),
        tb)));
  }

  // ---------- Materiallar ----------
  async function materials(c) {
    c.appendChild(h('div', { class: 'page-title' }, 'Materiallar'));
    var nIn = input({ placeholder: 'Material nomi' });
    var qIn = input({ type: 'number', min: '0', placeholder: 'Miqdor' });
    var uIn = input({ placeholder: 'Birlik', value: 'dona' });
    var mIn = input({ type: 'number', min: '0', placeholder: 'Minimal zaxira' });
    var addB = h('button', { class: 'btn btn-primary' }, 'Qo‘shish');
    addB.addEventListener('click', async function () {
      addB.disabled = true;
      try {
        await api.post('/api/admin/materials', { name: nIn.value.trim(), qty: Number(qIn.value) || 0, unit: uIn.value.trim() || 'dona', min_qty: Number(mIn.value) || 0 });
        toast('Qo‘shildi', 'ok'); rerender();
      } catch (e) { toast(e.message, 'err'); addB.disabled = false; }
    });
    c.appendChild(h('div', { class: 'card' },
      h('div', { class: 'section-title' }, 'Yangi material'),
      h('div', { class: 'row' },
        h('span', { class: 'grow' }, field('Nomi', nIn)), h('span', { class: 'grow' }, field('Miqdor', qIn))),
      h('div', { class: 'row' },
        h('span', { class: 'grow' }, field('Birlik', uIn)), h('span', { class: 'grow' }, field('Minimal zaxira', mIn))),
      addB
    ));
    var box = h('div', null);
    c.appendChild(box);
    var rows;
    try { rows = await api.get('/api/admin/materials'); }
    catch (e) { box.appendChild(empty(e.message, '⚠️')); return; }
    rows.forEach(function (m) {
      var qty = input({ type: 'number', value: String(m.qty), style: 'width:90px' });
      var save = h('button', { class: 'btn btn-sm btn-soft' }, 'Saqlash');
      save.addEventListener('click', async function () {
        try { await api.patch('/api/admin/materials/' + m.id, { qty: Number(qty.value) }); toast('Saqlandi', 'ok'); }
        catch (e) { toast(e.message, 'err'); }
      });
      var low = m.qty <= m.min_qty;
      box.appendChild(h('div', { class: 'card' },
        h('div', { class: 'task-head' }, h('div', { class: 'task-title' }, m.name),
          low ? h('span', { class: 'badge rejected' }, 'Kam qolgan') : h('span', { class: 'badge approved' }, 'yetarli')),
        h('div', { class: 'task-actions' },
          h('span', { class: 'small muted' }, 'Minimal: ' + m.min_qty + ' ' + m.unit),
          qty, save
        )
      ));
    });
  }

  function rerender() { TP.app.rerender(); }

  return {
    sections: {
      dashboard: dashboard, employees: employees, tasks: tasks,
      orders: orders, customers: customers, materials: materials,
      notifications: TP.views.notifications, profile: TP.views.profile,
    },
    drawerItems: [
      { hash: '#/admin', label: 'Boshqaruv paneli', icon: '📊' },
      { hash: '#/admin/employees', label: 'Xodimlar', icon: '👷' },
      { hash: '#/admin/tasks', label: 'Vazifalar', icon: '📋' },
      { hash: '#/admin/orders', label: 'Buyurtmalar', icon: '📦' },
      { hash: '#/admin/customers', label: 'Mijozlar', icon: '👥' },
      { hash: '#/admin/materials', label: 'Materiallar', icon: '🧵' },
      { hash: '#/admin/notifications', label: 'Bildirishnomalar', icon: '🔔' },
      { hash: '#/admin/profile', label: 'Shaxsiy profil', icon: '👤' },
    ],
    navItems: [
      { hash: '#/admin', label: 'Panel', icon: '📊' },
      { hash: '#/admin/tasks', label: 'Vazifalar', icon: '📋' },
      { hash: '#/admin/orders', label: 'Buyurtmalar', icon: '📦' },
      { hash: '#/admin/employees', label: 'Xodimlar', icon: '👷' },
      { hash: '#/admin/profile', label: 'Profil', icon: '👤' },
    ],
  };
})();
