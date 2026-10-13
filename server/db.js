'use strict';
// Ma'lumotlar bazasi: sxema yaratish va boshlang'ich ma'lumotlar (seed).
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const { hashPassword } = require('./auth');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','employee','customer')),
  position TEXT DEFAULT '',
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  photo TEXT DEFAULT '',
  qty INTEGER DEFAULT 1,
  price REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','ready','delivered','cancelled')),
  deadline TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER REFERENCES orders(id),
  employee_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  qty INTEGER DEFAULT 1,
  done_qty INTEGER DEFAULT 0,
  unit TEXT DEFAULT 'dona',
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','accepted','in_progress','submitted','approved','rejected')),
  deadline TEXT DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS task_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL DEFAULT 'comment' CHECK (type IN ('comment','problem','delay','system')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  qty REAL DEFAULT 0,
  unit TEXT DEFAULT 'dona',
  min_qty REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  is_read INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_employee ON tasks(employee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_events_task ON task_events(task_id);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);
`;

const now = () => new Date().toISOString();

function openDb(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  if (dbPath !== ':memory:') {
    // WAL: o'qish/yozish parallelroq; busy_timeout: band bo'lsa kutadi (lock xatolar kamayadi)
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA busy_timeout = 5000');
  }
  db.exec(SCHEMA);
  return db;
}

function notify(db, userId, title, body) {
  db.prepare('INSERT INTO notifications (user_id, title, body, is_read, created_at) VALUES (?,?,?,0,?)')
    .run(userId, title, body || '', now());
}

function notifyAdmins(db, title, body) {
  const admins = db.prepare("SELECT id FROM users WHERE role='admin' AND active=1").all();
  for (const a of admins) notify(db, a.id, title, body);
}

function seed(db) {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (c > 0) return false;

  const insUser = db.prepare('INSERT INTO users (login,name,password_hash,salt,role,position,active,created_at) VALUES (?,?,?,?,?,?,1,?)');
  const mk = (login, name, pass, role, position) => {
    const { salt, hash } = hashPassword(pass);
    const r = insUser.run(login, name, hash, salt, role, position || '', now());
    return Number(r.lastInsertRowid);
  };

  const adminId = mk('shaxobiddinumarovadmin', 'Shaxobiddin Umarov', '20132011Sh', 'admin', 'Boshqaruvchi');
  const hosilaId = mk('hosilaeshmuminova', 'Hosila Eshmuminova', '20132011Sh', 'employee', 'Tikuvchi');
  const custId = mk('901234567', 'Zuhra Rahimova', 'Mijoz123!', 'customer', '');

  const insOrder = db.prepare('INSERT INTO orders (customer_id,title,description,qty,price,status,deadline,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)');
  const today = new Date();
  const dstr = (d) => d.toISOString().slice(0, 10);
  const plus = (n) => { const x = new Date(today); x.setDate(x.getDate() + n); return x; };

  const o1 = Number(insOrder.run(custId, "Erkaklar kostyumi (2 ta)", "Qora mato, 52-o'lcham", 2, 1200000, 'in_progress', dstr(plus(3)), now(), now()).lastInsertRowid);
  const o2 = Number(insOrder.run(custId, "Ayollar platyasi", "Yashil ipak mato", 1, 650000, 'new', dstr(plus(7)), now(), now()).lastInsertRowid);
  insOrder.run(custId, "Bolalar kurtka (5 ta)", "Kuzgi, 8-12 yosh", 5, 900000, 'ready', dstr(plus(-1)), now(), now());

  const insTask = db.prepare('INSERT INTO tasks (order_id,employee_id,title,description,qty,done_qty,unit,status,deadline,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  const insEvent = db.prepare('INSERT INTO task_events (task_id,author_id,type,body,created_at) VALUES (?,?,?,?,?)');

  const t1 = Number(insTask.run(o1, hosilaId, "Kostyum tikish — 2 dona", "Yumshoq yubka va jilet, yumshoq podklad", 2, 0, 'dona', 'assigned', dstr(today), adminId, now(), now()).lastInsertRowid);
  notify(db, hosilaId, 'Yangi vazifa', '«Kostyum tikish — 2 dona» vazifasi sizga biriktirildi. Muddati: bugun.');
  insEvent.run(t1, adminId, 'system', 'Vazifa yaratildi va Hosila Eshmuminovaga biriktirildi.', now());

  const t2 = Number(insTask.run(o1, hosilaId, "Jilet yakunlash", "Buyurtma №' + o1 + ' uchun qo'shimcha jilet", 1, 0, 'dona', 'in_progress', dstr(plus(2)), adminId, now(), now()).lastInsertRowid);
  insEvent.run(t2, hosilaId, 'system', 'Ish boshlandi.', now());

  const t3 = Number(insTask.run(o2, hosilaId, "Platyaga batafsil tikuv", "1 dona platye, naqshli tikuv", 1, 1, 'dona', 'approved', dstr(plus(-2)), adminId, now(), now()).lastInsertRowid);
  insEvent.run(t3, adminId, 'system', 'Vazifa bajarildi va mijozga yuborildi.', now());

  const insMat = db.prepare('INSERT INTO materials (name,qty,unit,min_qty) VALUES (?,?,?,?)');
  insMat.run('Qora mato (m)', 120, 'metr', 20);
  insMat.run('Ip (klubok)', 45, 'dona', 10);
  insMat.run('Tugma (qop)', 12, 'qop', 5);
  insMat.run('Zamok (yashil)', 30, 'dona', 8);

  return true;
}

module.exports = { openDb, seed, notify, notifyAdmins, now };
