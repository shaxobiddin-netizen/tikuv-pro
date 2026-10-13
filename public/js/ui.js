// UI yordamchilar: DOM quruvchi, formatlash, modal, toast.
window.TP = window.TP || {};

TP.ui = (function () {
  // h('div', {class:'x', onclick:fn}, 'matn', node..., [node, node])
  function h(tag, attrs) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    for (var k in attrs) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'html') el.innerHTML = attrs[k]; // faqat ishonchli HTML uchun ishlatiladi
      else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) el.setAttribute(k, attrs[k]);
    }
    function append(c) {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) { c.forEach(append); return; }
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    for (var i = 2; i < arguments.length; i++) append(arguments[i]);
    return el;
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    if (isNaN(d)) return iso;
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
  }
  function fmtDateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function isOverdue(deadline) {
    return !!deadline && deadline < todayStr();
  }

  var STATUS_UZ = {
    assigned: 'Yuborildi', accepted: 'Qabul qilindi', in_progress: 'Jarayonda',
    submitted: 'Tasdiq kutilmoqda', approved: 'Bajarilgan', rejected: 'Qaytarilgan',
    new: 'Yangi', ready: 'Tayyor', delivered: 'Yetkazilgan', cancelled: 'Bekor qilingan',
  };
  function statusLabel(s) { return STATUS_UZ[s] || s; }
  function badge(s) { return h('span', { class: 'badge ' + s }, statusLabel(s)); }

  function toast(msg, type) {
    var wrap = document.querySelector('.toast-wrap');
    if (!wrap) {
      wrap = h('div', { class: 'toast-wrap' });
      document.body.appendChild(wrap);
    }
    var t = h('div', { class: 'toast ' + (type || '') }, msg);
    wrap.appendChild(t);
    setTimeout(function () { t.remove(); }, 3400);
  }

  function modal(title, contentNode, opts) {
    opts = opts || {};
    var overlay = h('div', { class: 'modal-overlay' });
    var closeBtn = h('button', { class: 'icon-btn', onclick: close }, '✕');
    var box = h('div', { class: 'modal' },
      h('div', { class: 'modal-head' }, h('h3', null, title), closeBtn),
      contentNode
    );
    overlay.appendChild(box);
    overlay.addEventListener('click', function (e) { if (e.target === overlay && !opts.sticky) close(); });
    function close() { overlay.remove(); }
    document.body.appendChild(overlay);
    return close;
  }

  function confirmDlg(text, onYes, danger) {
    var body = h('div', null,
      h('p', { class: 'mb12' }, text),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-ghost grow', onclick: function () { close(); } }, 'Bekor qilish'),
        h('button', {
          class: 'btn grow ' + (danger ? 'btn-danger' : 'btn-primary'),
          onclick: function () { close(); onYes(); },
        }, 'Ha')
      )
    );
    var close = modal('Tasdiqlash', body, { sticky: true });
  }

  function empty(text, icon) {
    return h('div', { class: 'empty' }, h('div', { class: 'big' }, icon || '🗂️'), text);
  }

  function readFileAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error("Faylni o'qib bo'lmadi")); };
      r.readAsDataURL(file);
    });
  }

  function deadlineChip(deadline) {
    if (!deadline) return null;
    var overdue = isOverdue(deadline);
    return h('span', { class: 'badge', style: overdue ? 'background:var(--danger-soft);color:var(--danger)' : 'background:var(--warn-soft);color:var(--warn)' },
      (overdue ? 'Muddati o‘tdi: ' : 'Muddat: ') + fmtDate(deadline));
  }

  return {
    h: h, fmtDate: fmtDate, fmtDateTime: fmtDateTime, todayStr: todayStr, isOverdue: isOverdue,
    statusLabel: statusLabel, badge: badge, toast: toast, modal: modal, confirmDlg: confirmDlg,
    empty: empty, readFileAsDataURL: readFileAsDataURL, deadlineChip: deadlineChip,
  };
})();
