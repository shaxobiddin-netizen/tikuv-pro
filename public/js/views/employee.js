// XODIM paneli: 9 ta bo'lim va vazifa ustida 6 ta amal.
window.TP = window.TP || {};
TP.views = TP.views || {};

TP.views.employee = (function () {
  var h = TP.ui.h, api = TP.api, toast = TP.ui.toast, badge = TP.ui.badge, empty = TP.ui.empty;

  // ---------- Vazifa kartasi ----------
  function taskCard(t, refresh) {
    var pct = t.qty > 0 ? Math.round((t.done_qty / t.qty) * 100) : 0;
    var head = h('div', { class: 'task-head' },
      h('div', { class: 'task-title' }, t.title),
      badge(t.status)
    );
    var meta = h('div', { class: 'task-meta' },
      h('span', null, 'Miqdor: ' + t.done_qty + '/' + t.qty + ' ' + t.unit),
      t.deadline ? h('span', null, 'Muddat: ' + TP.ui.fmtDate(t.deadline)) : null,
      t.order_title ? h('span', null, 'Buyurtma: ' + t.order_title) : null
    );
    var card = h('div', { class: 'card' }, head, meta);
    if (t.description) card.appendChild(h('div', { class: 'small muted mt8' }, t.description));

    var track = h('div', { class: 'progress-track' }, h('div', { class: 'progress-fill', style: 'width:' + pct + '%' }));
    card.appendChild(track);

    var actions = h('div', { class: 'task-actions' });

    function act(label, cls, fn) {
      var b = h('button', { class: 'btn btn-sm ' + cls }, label);
      b.addEventListener('click', async function () {
        b.disabled = true;
        try { await fn(); refresh(); } catch (e) { toast(e.message, 'err'); b.disabled = false; }
      });
      return b;
    }

    // 1) Qabul qilish
    if (t.status === 'assigned') actions.appendChild(act('Qabul qilish', 'btn-primary', function () { return api.post('/api/employee/tasks/' + t.id + '/accept'); }));
    // 2) Ishni boshlash
    if (t.status === 'accepted') actions.appendChild(act('Ishni boshlash', 'btn-primary', function () { return api.post('/api/employee/tasks/' + t.id + '/start'); }));

    // 3) Bajarilgan son kiritish (ish jarayonida)
    if (['accepted', 'in_progress'].indexOf(t.status) >= 0) {
      var qtyInput = h('input', { type: 'number', min: '0', max: String(t.qty), value: String(t.done_qty), style: 'width:76px;padding:7px 9px;border:1px solid var(--border);border-radius:8px' });
      actions.appendChild(h('span', { class: 'row', style: 'gap:6px' },
        qtyInput,
        act('Saqlash', 'btn-soft', function () {
          return api.post('/api/employee/tasks/' + t.id + '/progress', { done_qty: Number(qtyInput.value) || 0 })
            .then(function () { toast('Saqlandi', 'ok'); });
        })
      ));
    }
    // 4) Yakunlash — ish avtomatik mijozga yuboriladi
    if (['accepted', 'in_progress'].indexOf(t.status) >= 0) {
      actions.appendChild(act('Yakunlash', 'btn-warn', function () {
        return api.post('/api/employee/tasks/' + t.id + '/submit').then(function () { toast('Ish yakunlandi — mijozga yuborildi', 'ok'); });
      }));
    }
    // 5) Izoh qoldirish (muammo/kechikish)
    if (t.status !== 'approved') {
      actions.appendChild(h('button', {
        class: 'btn btn-sm btn-ghost',
        onclick: function () { commentModal(t, refresh); },
      }, 'Izoh qoldirish'));
    }
    // Batafsil (izohlar tarixi)
    actions.appendChild(h('button', {
      class: 'btn btn-sm btn-ghost',
      onclick: function () { detailModal(t, refresh); },
    }, 'Batafsil'));

    if (actions.childNodes.length) card.appendChild(actions);
    return card;
  }

  // ---------- Izoh modal ----------
  function commentModal(t, refresh) {
    var typeSel = h('select', null,
      h('option', { value: 'comment' }, 'Oddiy izoh'),
      h('option', { value: 'problem' }, 'Muammo'),
      h('option', { value: 'delay' }, 'Kechikish')
    );
    var text = h('textarea', { placeholder: 'Izoh matni…' });
    var body = h('div', null,
      h('div', { class: 'field' }, h('label', null, 'Izoh turi'), typeSel),
      h('div', { class: 'field' }, h('label', null, 'Matn'), text),
      h('button', {
        class: 'btn btn-primary btn-block',
        onclick: async function (ev) {
          if (!text.value.trim()) { toast('Izoh matnini kiriting', 'err'); return; }
          ev.target.disabled = true;
          try {
            await api.post('/api/employee/tasks/' + t.id + '/comment', { type: typeSel.value, body: text.value.trim() });
            close(); toast('Izoh yuborildi', 'ok'); refresh();
          } catch (e) { toast(e.message, 'err'); ev.target.disabled = false; }
        },
      }, 'Yuborish')
    );
    var close = TP.ui.modal('Izoh qoldirish — ' + t.title, body);
  }

  // ---------- Batafsil modal (voqealar tarixi bilan) ----------
  async function detailModal(t, refresh) {
    var body = h('div', null, h('p', { class: 'muted' }, 'Yuklanmoqda…'));
    var close = TP.ui.modal(t.title, body);
    var data;
    try { data = await api.get('/api/employee/tasks/' + t.id); }
    catch (e) { body.textContent = ''; body.appendChild(empty(e.message, '⚠️')); return; }
    var task = data.task;
    body.textContent = '';
    body.appendChild(h('div', { class: 'row mb12' },
      badge(task.status),
      task.customer_name ? h('span', { class: 'small muted' }, 'Mijoz: ' + task.customer_name) : null,
      TP.ui.deadlineChip(task.deadline)
    ));
    if (task.description) body.appendChild(h('p', { class: 'small mb12' }, task.description));
    body.appendChild(h('div', { class: 'section-title' }, 'Jarayon tarixi'));
    var tl = h('div', { class: 'timeline' });
    data.events.forEach(function (e) {
      tl.appendChild(h('div', { class: 'tl-item' + (e.type === 'problem' ? ' tl-problem' : e.type === 'delay' ? ' tl-delay' : '') },
        h('div', null, (e.type === 'problem' ? '⚠️ ' : e.type === 'delay' ? '⏰ ' : e.type === 'system' ? 'ℹ️ ' : '') + e.body),
        h('div', { class: 'tl-meta' }, e.author_name + ' • ' + TP.ui.fmtDateTime(e.created_at))
      ));
    });
    body.appendChild(tl);
    // Kartadagi amallarni modalda ham ko'rsatish
    var wrap = h('div', null);
    var card = taskCard(task, function () { close(); refresh(); });
    wrap.appendChild(h('div', { class: 'section-title' }, 'Amallar'));
    wrap.appendChild(card);
    body.appendChild(wrap);
  }

  function renderTaskList(container, tasks, refreshMsg) {
    if (!tasks.length) { container.appendChild(empty(refreshMsg || 'Vazifalar yo‘q', '✅')); return; }
    tasks.forEach(function (t) {
      container.appendChild(taskCard(t, function () { TP.app.rerender(); }));
    });
  }

  async function loadTasks(filter) {
    return api.get('/api/employee/tasks' + (filter ? '?filter=' + filter : ''));
  }

  // ---------- Bo'limlar ----------
  var sections = {};

  // 1+2. Asosiy (dashboard)
  sections.dashboard = async function (c) {
    c.appendChild(h('div', { class: 'page-title' }, 'Asosiy panel'));
    var s;
    try { s = await api.get('/api/employee/summary'); }
    catch (e) { c.appendChild(empty(e.message, '⚠️')); return; }
    c.appendChild(h('div', { class: 'stat-grid' },
      stat(s.assigned, 'Kutilayotgan vazifalar', 'c-blue'),
      stat(s.inProgress, 'Jarayondagi ishlar', 'c-violet'),
      stat(s.today, 'Bugungi ishlar', 'c-amber'),
      stat(s.overdue, 'Muddati o‘tgan', 'c-red'),
      stat(s.completed, 'Bajarilgan ishlar', 'c-green'),
      stat(s.completedToday, 'Bugun yakunlangan', 'c-teal')
    ));
    c.appendChild(h('div', { class: 'section-title' }, 'Bugungi ishlar'));
    var box = h('div', null);
    c.appendChild(box);
    var tasks = await loadTasks('today');
    renderTaskList(box, tasks, 'Bugun bajariladigan ish yo‘q. Ajoyib!');
  };

  // 2. Mening vazifalarim (tablar bilan)
  sections.tasks = async function (c) {
    c.appendChild(h('div', { class: 'page-title' }, 'Mening vazifalarim'));
    var tabAll = tabBtn('Barchasi', function () { setTab('all'); });
    var tabWait = tabBtn('Kutilmoqda', function () { setTab('wait'); });
    var tabProg = tabBtn('Jarayonda', function () { setTab('prog'); });
    var tabs = h('div', { class: 'tabs' }, tabAll, tabWait, tabProg);
    c.appendChild(tabs);
    var box = h('div', null, h('p', { class: 'muted' }, 'Yuklanmoqda…'));
    c.appendChild(box);

    var current = 'all';
    function tabBtn(label, fn) {
      var b = h('button', { onclick: fn }, label);
      return b;
    }
    async function setTab(which) {
      current = which;
      [tabAll, tabWait, tabProg].forEach(function (b) { b.classList.remove('active'); });
      ({ all: tabAll, wait: tabWait, prog: tabProg })[which].classList.add('active');
      box.textContent = '';
      box.appendChild(h('p', { class: 'muted' }, 'Yuklanmoqda…'));
      var tasks = await loadTasks();
      if (which === 'wait') tasks = tasks.filter(function (t) { return t.status === 'assigned'; });
      if (which === 'prog') tasks = tasks.filter(function (t) { return t.status === 'accepted' || t.status === 'in_progress'; });
      box.textContent = '';
      renderTaskList(box, tasks, 'Bu bo‘limda vazifalar yo‘q');
    }
    await setTab('all');
  };

  // 3. Bugungi ishlar
  sections.today = async function (c) {
    c.appendChild(h('div', { class: 'page-title' }, 'Bugungi ishlar'));
    c.appendChild(h('p', { class: 'small muted mb12' }, TP.ui.fmtDate(new Date().toISOString()) + ' uchun belgilangan va muddati o‘tgan faol vazifalar.'));
    var box = h('div', null);
    c.appendChild(box);
    renderTaskList(box, await loadTasks('today'), 'Bugungi ish yo‘q');
  };

  // 4. Jarayondagi buyurtmalar
  sections.orders = async function (c) {
    c.appendChild(h('div', { class: 'page-title' }, 'Jarayondagi buyurtmalar'));
    c.appendChild(h('p', { class: 'small muted mb12' }, 'Sizning vazifalaringiz bog‘langan buyurtmalar (faqat shular ko‘rinadi).'));
    var box = h('div', null);
    c.appendChild(box);
    var orders;
    try { orders = await api.get('/api/employee/orders'); }
    catch (e) { box.appendChild(empty(e.message, '⚠️')); return; }
    if (!orders.length) { box.appendChild(empty('Sizga biriktirilgan buyurtmalar yo‘q', '📦')); return; }
    orders.forEach(function (o) {
      var pct = o.my_qty > 0 ? Math.round((o.my_done / o.my_qty) * 100) : 0;
      box.appendChild(h('div', { class: 'card' },
        h('div', { class: 'task-head' }, h('div', { class: 'task-title' }, o.title), badge(o.status)),
        h('div', { class: 'task-meta' },
          h('span', null, 'Mijoz: ' + (o.customer_name || '—')),
          h('span', null, 'Sizning ulushingiz: ' + o.my_done + '/' + o.my_qty + ' dona'),
          o.deadline ? h('span', null, 'Muddat: ' + TP.ui.fmtDate(o.deadline)) : null
        ),
        h('div', { class: 'progress-track' }, h('div', { class: 'progress-fill', style: 'width:' + pct + '%' }))
      ));
    });
  };

  // 5. Bajarilgan ishlar
  sections.completed = async function (c) {
    c.appendChild(h('div', { class: 'page-title' }, 'Bajarilgan ishlar'));
    var box = h('div', null);
    c.appendChild(box);
    renderTaskList(box, await loadTasks('completed'), 'Hozircha bajarilgan ishlar yo‘q');
  };

  // 6. Topshirish muddati
  sections.deadlines = async function (c) {
    c.appendChild(h('div', { class: 'page-title' }, 'Topshirish muddati'));
    c.appendChild(h('p', { class: 'small muted mb12' }, 'Muddat bo‘yicha tartiblangan faol vazifalar. Qizil — muddati o‘tgan.'));
    var box = h('div', null);
    c.appendChild(box);
    var tasks = await loadTasks('deadline');
    if (!tasks.length) { box.appendChild(empty('Faol vazifalar yo‘q', '📅')); return; }
    tasks.forEach(function (t) {
      var chip = TP.ui.deadlineChip(t.deadline) || h('span', { class: 'badge' }, 'Muddat belgilanmagan');
      var card = h('div', { class: 'card' },
        h('div', { class: 'task-head' }, h('div', { class: 'task-title' }, t.title), badge(t.status)),
        h('div', { class: 'task-meta' }, chip, h('span', null, t.done_qty + '/' + t.qty + ' ' + t.unit))
      );
      box.appendChild(card);
    });
  };

  // 7. Materiallar (faqat o'qish)
  sections.materials = async function (c) {
    c.appendChild(h('div', { class: 'page-title' }, 'Materiallar'));
    c.appendChild(h('p', { class: 'small muted mb12' }, "Ombordagi materiallar holati (faqat ko'rish rejimida)."));
    var box = h('div', null);
    c.appendChild(box);
    var mats;
    try { mats = await api.get('/api/employee/materials'); }
    catch (e) { box.appendChild(empty(e.message, '⚠️')); return; }
    if (!mats.length) { box.appendChild(empty('Materiallar ro‘yxati bo‘sh', '🧵')); return; }
    var tbl = h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, h('th', null, 'Nomi'), h('th', null, 'Miqdor'), h('th', null, 'Holat'))));
    var tb = h('tbody', null);
    mats.forEach(function (m) {
      var low = m.qty <= m.min_qty;
      tb.appendChild(h('tr', null,
        h('td', null, m.name),
        h('td', null, String(m.qty).replace(/\.0+$/, '') + ' ' + m.unit),
        h('td', null, low ? h('span', { class: 'badge rejected' }, 'Kam qolgan') : h('span', { class: 'badge approved' }, 'Yetarli'))
      ));
    });
    tbl.appendChild(tb);
    box.appendChild(h('div', { class: 'tbl-wrap' }, tbl));
  };

  function stat(num, label, cls) {
    return h('div', { class: 'stat-card ' + cls },
      h('div', { class: 'num' }, String(num)),
      h('div', { class: 'lbl' }, label));
  }

  return {
    sections: sections,
    drawerItems: [
      { hash: '#/employee', label: 'Asosiy panel', icon: '🏠' },
      { hash: '#/employee/tasks', label: 'Mening vazifalarim', icon: '📋' },
      { hash: '#/employee/today', label: 'Bugungi ishlar', icon: '📆' },
      { hash: '#/employee/orders', label: 'Jarayondagi buyurtmalar', icon: '📦' },
      { hash: '#/employee/completed', label: 'Bajarilgan ishlar', icon: '✅' },
      { hash: '#/employee/deadlines', label: 'Topshirish muddati', icon: '⏰' },
      { hash: '#/employee/materials', label: 'Materiallar', icon: '🧵' },
      { hash: '#/employee/notifications', label: 'Bildirishnomalar', icon: '🔔' },
      { hash: '#/employee/profile', label: 'Shaxsiy profil', icon: '👤' },
    ],
    navItems: [
      { hash: '#/employee', label: 'Asosiy', icon: '🏠' },
      { hash: '#/employee/tasks', label: 'Vazifalar', icon: '📋' },
      { hash: '#/employee/orders', label: 'Buyurtmalar', icon: '📦' },
      { hash: '#/employee/deadlines', label: 'Muddat', icon: '⏰' },
      { hash: '#/employee/profile', label: 'Profil', icon: '👤' },
    ],
  };
})();
