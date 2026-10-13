'use strict';
// Frontend UI testi: haqiqiy serverga qarshi mini-DOM da ilova skriptlarini yurgizib,
// uchala rolning asosiy oqimlarini tekshiradi.  Ishga tushirish: npm run test:ui
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// ---------- Mini DOM (faqat ilovamiz ishlatadigan API) ----------
class El {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.children = [];
    this.childNodes = this.children;
    this.parentNode = null;
    this.attributes = {};
    this.style = {};
    this.className = '';
    this.listeners = {};
    this.value = '';
    this.disabled = false;
    this._text = null;
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  dispatch(t, ev) {
    ev = ev || {};
    ev.target = ev.target || this;
    (this.listeners[t] || []).forEach((f) => f.call(this, ev));
  }
  click() { this.dispatch('click'); }
  appendChild(c) {
    if (typeof c === 'string' || typeof c === 'number') { this.children.push(String(c)); return c; }
    // Real brauzer DOM'ida massiv/oddobiy object appendChild qilish TypeError beradi —
    // mini-DOM ham shu xatti-harakatni taqlid qiladi.
    if (!(c instanceof El)) throw new TypeError('appendChild: Node kutildi, kelgan: ' + Object.prototype.toString.call(c));
    c.parentNode = this;
    this.children.push(c);
    return c;
  }
  insertBefore(c, ref) {
    if (typeof c === 'string') {
      const i = ref ? this.children.indexOf(ref) : -1;
      if (i >= 0) this.children.splice(i, 0, c); else this.children.push(c);
      return c;
    }
    c.parentNode = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i >= 0) this.children.splice(i, 0, c); else this.children.push(c);
    return c;
  }
  remove() {
    if (this.parentNode) {
      const i = this.parentNode.children.indexOf(this);
      if (i >= 0) this.parentNode.children.splice(i, 1);
      this.parentNode = null;
    }
  }
  set textContent(v) { this.children.length = 0; this._text = v === null || v === undefined ? '' : String(v); }
  get textContent() { return this.allText(); }
  allText() {
    if (this._text !== null && this.children.length === 0) return this._text;
    return this.children.map((c) => (typeof c === 'string' ? c : (c && typeof c.allText === 'function' ? c.allText() : String(c)))).join('');
  }
  get firstChild() { return this.children[0] || null; }
  get classList() {
    const self = this;
    return {
      add: (c) => { if (!self.hasClass(c)) self.className = (self.className + ' ' + c).trim(); },
      remove: (c) => { self.className = self.className.split(/\s+/).filter((x) => x && x !== c).join(' '); },
      toggle: (c, force) => { const has = self.hasClass(c); const want = force === undefined ? !has : !!force; if (want && !has) self.classList.add(c); if (!want && has) self.classList.remove(c); },
      contains: (c) => self.hasClass(c),
    };
  }
  hasClass(c) { return this.className.split(/\s+/).indexOf(c) >= 0; }
  matches(part) {
    if (part.startsWith('.')) return this.hasClass(part.slice(1));
    if (part.startsWith('#')) return this.attributes.id === part.slice(1);
    return this.tagName === part.toUpperCase();
  }
  querySelectorAll(sel) {
    const parts = sel.trim().split(/\s+/);
    const out = [];
    const chainOk = (node) => {
      let cur = node;
      for (let i = parts.length - 1; i >= 0; i--) {
        while (cur && !cur.matches(parts[i])) cur = cur.parentNode;
        if (!cur) return false;
        cur = cur.parentNode;
      }
      return true;
    };
    const walk = (node) => {
      for (const c of node.children) {
        if (typeof c === 'string') continue;
        if (c.matches(parts[parts.length - 1]) && chainOk(c)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

function makeDocument() {
  const doc = new El('#document');
  doc.body = new El('body');
  doc.readyState = 'complete';
  doc.winListeners = {};
  doc.createElement = (t) => new El(t);
  doc.createTextNode = (t) => String(t);
  doc.getElementById = (id) => (id === 'app' ? doc.appRoot : null);
  doc.addEventListener = (t, fn) => { (doc.winListeners[t] = doc.winListeners[t] || []).push(fn); };
  doc.querySelector = (sel) => {
    if (sel.startsWith('.toast-wrap')) return doc.body.querySelector(sel);
    return (doc.appRoot.querySelector(sel) || doc.body.querySelector(sel));
  };
  doc.querySelectorAll = (sel) => doc.appRoot.querySelectorAll(sel).concat(doc.body.querySelectorAll(sel));
  doc.appRoot = new El('div');
  doc.appRoot.attributes.id = 'app';
  return doc;
}

// ---------- Harness ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 3000)) {
    if (pred()) return true;
    await sleep(60);
  }
  return pred();
}
let passed = 0, failed = 0;
let lastTextFn = null;
function check(name, cond) {
  if (cond) { passed++; console.log('  PASS ' + name); }
  else {
    failed++;
    console.log('  FAIL ' + name);
    if (lastTextFn) console.log('    DEBUG: ' + lastTextFn().replace(/\s+/g, ' ').slice(0, 300));
  }
}

async function run(opts) {
  opts = opts || {};
  const { createServer } = require(path.join(ROOT, 'server', 'index.js'));
  const { server } = createServer({ dbPath: (opts && opts.dbPath) || ':memory:', secret: 'harness-secret', port: 0 });
  await new Promise((r) => server.listen(0, r));
  const origin = 'http://127.0.0.1:' + server.address().port;

  const doc = makeDocument();
  const listeners = {};
  const storage = {};
  const realFetch = globalThis.fetch;
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    fetch: (u, o) => realFetch(String(u).startsWith('/') ? origin + u : u, o),
    document: doc,
    navigator: { onLine: true },
    localStorage: {
      getItem: (k) => (k in storage ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: (k) => { delete storage[k]; },
    },
  };
  let currentHash = '';
  sandbox.location = { protocol: 'http:', href: origin + '/' };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.addEventListener = (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); };
  sandbox.dispatch = (t, ev) => (listeners[t] || []).forEach((f) => f(ev || {}));
  Object.defineProperty(sandbox.location, 'hash', {
    get: () => currentHash,
    set: (v) => {
      const changed = v !== currentHash;
      currentHash = v;
      if (changed) sandbox.dispatch('hashchange');
    },
  });

  const files = ['public/js/api.js', 'public/js/ui.js', 'public/js/views/shared.js', 'public/js/views/auth.js',
    'public/js/views/employee.js', 'public/js/views/admin.js', 'public/js/views/customer.js', 'public/js/app.js'];
  vm.createContext(sandbox);
  for (const f of files) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(code, sandbox, { filename: f });
  }

  const nav = (hash) => { sandbox.location.hash = hash; };
  const text = () => doc.appRoot.allText() + ' ' + doc.body.allText();
  lastTextFn = text;
  globalThis.__dbg = { sandbox, doc };
  const TP = sandbox.TP;
  await sleep(150); // boot() initSession kutadi

  console.log('\n[1] Kirish sahifasi');
  check('login ekrani ko\'rinadi', text().includes('Tikuvchilik ishlab chiqarish boshqaruvi'));

  async function login(login, pass) {
    const inputs = doc.appRoot.querySelectorAll('input');
    inputs[0].value = login;
    inputs[1].value = pass;
    doc.appRoot.querySelector('.auth-card .btn-primary').click();
    await sleep(350);
  }

  console.log('\n[2] Xodim oqimi (hosila)');
  await login('hosilaeshmuminova', '20132011Sh');
  check('xodim paneli ochiladi', await waitFor(() => text().includes('Asosiy panel')));
  check('stat kartalari', await waitFor(() => text().includes('Kutilayotgan vazifalar')));
  nav('#/employee/tasks');
  check('vazifalar ro\'yxati', await waitFor(() => text().includes('Mening vazifalarim') && text().includes('Kostyum tikish')));
  const qBtn = await (async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 3000) {
      const b = doc.appRoot.querySelectorAll('button').find((x) => x.allText() === 'Qabul qilish');
      if (b) return b;
      await sleep(60);
    }
    return null;
  })();
  if (qBtn) { qBtn.click(); }
  check('vazifa qabul qilindi (UI)', await waitFor(() => !doc.appRoot.querySelectorAll('button').some((b) => b.allText() === 'Qabul qilish')));
  nav('#/employee/materials');
  check('materiallar faol-korinish', await waitFor(() => text().includes('Qora mato')));
  nav('#/employee/orders');
  check('xodim buyurtmalari', await waitFor(() => text().includes('Jarayondagi buyurtmalar')));
  nav('#/employee/profile');
  check('profil sahifasi', await waitFor(() => text().includes('Shaxsiy profil')));
  await TP.app.logout();
  await sleep(150);

  console.log('\n[3] Admin oqimi');
  await login('shaxobiddinumarovadmin', '20132011Sh');
  check('admin paneli', await waitFor(() => text().includes('Boshqaruv paneli')));
  nav('#/admin/employees');
  check('xodimlar boshqaruvi', await waitFor(() => text().includes('Hosila Eshmuminova') && text().includes('Xodim qo‘shish')));
  nav('#/admin/tasks');
  check('vazifalar boshqaruvi', await waitFor(() => text().includes('Vazifa biriktirish')));
  const taskSels = doc.appRoot.querySelectorAll('select');
  check('vazifalar: selectlarda optionlar bor', taskSels.length >= 2 && taskSels.every((s) => s.querySelectorAll('option').length > 0));
  nav('#/admin/orders');
  check('buyurtmalar boshqaruvi', await waitFor(() => text().includes('Mijoz nomidan buyurtma')));
  const ordSels = doc.appRoot.querySelectorAll('select');
  check('buyurtmalar: selectlarda optionlar bor', ordSels.length >= 1 && ordSels.every((s) => s.querySelectorAll('option').length > 0));
  await TP.app.logout();
  await sleep(150);

  console.log('\n[4] Mijoz oqimi');
  await login('901234567', 'Mijoz123!');
  check('mijoz buyurtmalari', await waitFor(() => text().includes('Buyurtmalarim')));
  nav('#/customer/new');
  check('yangi buyurtma formasi', await waitFor(() => text().includes('Yangi buyurtma')));
  const tInput = doc.appRoot.querySelectorAll('.card input')[0];
  tInput.value = 'Harness test yubka';
  const sBtn = doc.appRoot.querySelectorAll('button').find((b) => b.allText() === 'Buyurtma berish');
  sBtn.click();
  await sleep(400);
  const toastMsg = doc.body.querySelectorAll('.toast').map((t) => t.allText()).join(' | ');
  if (toastMsg) console.log('    toast: ' + toastMsg);
  // ilova o'zi hash'ni o'zgartirib, ro'yxatni yangilaydi — shuni kutamiz
  check('buyurtma yaratildi va ko\'rinadi', await waitFor(() => sandbox.location.hash === '#/customer/orders' && text().includes('Harness test yubka'), 5000));

  // Ruxsat tekshiruvi (frontend darajasida ham): mijoz URL orqali xodim bo'limiga kirmoqchi
  nav('#/employee/tasks');
  await sleep(150);
  check('rol URL himoyasi', text().includes('Buyurtmalarim') || !text().includes('Mening vazifalarim'));

  console.log('\n[5] Buyurtma avtomatik xodimga biriktiriladi va yakunlanadi');
  await TP.app.logout();
  await sleep(150);
  await login('hosilaeshmuminova', '20132011Sh');
  nav('#/employee/tasks');
  check('yangi buyurtma vazifasi xodimga avtomatik tushdi', await waitFor(() => text().includes('Harness test yubka')));
  const cardWith = (t2) => doc.appRoot.querySelectorAll('.card').find((x) => x.allText().includes(t2));
  async function clickInCard(title, label) {
    const t0 = Date.now();
    while (Date.now() - t0 < 3000) {
      const card = cardWith(title);
      const b = card && card.querySelectorAll('button').find((x) => x.allText() === label);
      if (b) { b.click(); return true; }
      await sleep(60);
    }
    return false;
  }
  check('avto-vazifa qabul qilindi (UI)', await clickInCard('Harness test yubka', 'Qabul qilish'));
  check('ish boshlandi (UI)', await clickInCard('Harness test yubka', 'Ishni boshlash'));
  await waitFor(() => {
    const c = cardWith('Harness test yubka');
    return c && c.querySelectorAll('input').length > 0;
  });
  cardWith('Harness test yubka').querySelectorAll('input')[0].value = '1';
  check('bajarilgan son saqlandi (UI)', await clickInCard('Harness test yubka', 'Saqlash'));
  check('yakunlash (UI, tasdiq bosqichisiz)', await clickInCard('Harness test yubka', 'Yakunlash'));
  check('vazifa darhol bajarilgan bo\'ladi (UI)', await waitFor(() => {
    const c = cardWith('Harness test yubka');
    return c && c.allText().includes('Bajarilgan') && !c.querySelectorAll('button').some((b) => b.allText() === 'Yakunlash');
  }));
  await TP.app.logout();
  await sleep(150);
  await login('901234567', 'Mijoz123!');
  nav('#/customer/orders');
  check('mijoz buyurtmani "Tayyor" holatida ko\'radi', await waitFor(() => {
    const c = cardWith('Harness test yubka');
    return c && c.allText().includes('Tayyor');
  }));

  server.close();
  console.log('\n========================================');
  console.log(`Natija: ${passed} ta o'tdi, ${failed} ta xato`);
  console.log('========================================');
  if (!opts.noExit) process.exit(failed ? 1 : 0);
  return failed;
}

if (require.main === module) {
  run().catch((e) => { console.error('Harness xatosi:', e); process.exit(1); });
}

module.exports = { run };
