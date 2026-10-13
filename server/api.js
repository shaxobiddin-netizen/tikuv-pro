'use strict';
// REST API: barcha endpointlar rol ruxsati bilan himoyalangan.
const { hashPassword, verifyPassword, signToken } = require('./auth');
const { notify, notifyAdmins, now } = require('./db');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const COOKIE_NAME = 'tp_session';

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
  return true;
}
const ok = (res, data) => send(res, 200, { ok: true, data });
const bad = (res, msg, status = 400) => send(res, status, { ok: false, error: msg });

const intOr = (v, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : dflt;
};
const strOr = (v, dflt = '') => (typeof v === 'string' ? v.trim().slice(0, 2000) : dflt);
const todayStr = () => new Date().toISOString().slice(0, 10);

function publicUser(u) {
  return { id: u.id, login: u.login, name: u.name, role: u.role, position: u.position, created_at: u.created_at };
}

function compile(pattern) {
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$');
  return { rx, keys };
}

function makeRouter(db, secret, uploadsDir) {
  const routes = [];
  // Login urinishlari: IP bo'yicha 10 ta xato / 5 daqiqa
  const loginAttempts = new Map();
  const route = (method, pattern, roles, handler) => {
    const { rx, keys } = compile(pattern);
    routes.push({ method, rx, keys, roles, handler });
  };

  const setSession = (res, req, user) => {
    const token = signToken({ uid: user.id, role: user.role }, secret);
    const secure = req.socket.encrypted ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}${secure}`);
  };
  const clearSession = (res) => {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  };

  const requireFields = (body, fields) => {
    for (const f of fields) {
      const v = body[f];
      if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) return `${f} kiritilishi shart`;
    }
    return null;
  };

  const savePhoto = (orderId, dataUrl) => {
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
    if (!m) return { err: "Rasm faqat JPEG, PNG yoki WebP formatda bo'lishi kerak" };
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 3 * 1024 * 1024) return { err: "Rasm hajmi 3 MB dan katta bo'lmasligi kerak" };
    fs.mkdirSync(uploadsDir, { recursive: true });
    const name = `order-${orderId}-${crypto.randomBytes(6).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    fs.writeFileSync(path.join(uploadsDir, name), buf);
    return { name };
  };

  const addEvent = (taskId, authorId, type, body) => {
    db.prepare('INSERT INTO task_events (task_id, author_id, type, body, created_at) VALUES (?,?,?,?,?)')
      .run(taskId, authorId, type, body, now());
  };

  // Buyurtma kelganda eng kam yuklangan faol xodimga avtomatik vazifa ochadi.
  const autoAssignOrder = (order, actorId) => {
    const emp = db.prepare(`
      SELECT u.id, u.name,
        (SELECT COUNT(*) FROM tasks t WHERE t.employee_id = u.id AND t.status != 'approved') AS load
      FROM users u WHERE u.role = 'employee' AND u.active = 1
      ORDER BY load ASC, u.id ASC LIMIT 1`).get();
    if (!emp) {
      notifyAdmins(db, 'Xodim biriktirilmadi', `«${order.title}» buyurtmasi keldi, lekin faol xodim yo'q. Xodim qo'shing yoki vazifani qo'lda biriktiring.`);
      return null;
    }
    const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' AND active = 1 ORDER BY id LIMIT 1").get();
    const r = db.prepare('INSERT INTO tasks (order_id,employee_id,title,description,qty,done_qty,unit,status,deadline,created_by,created_at,updated_at) VALUES (?,?,?,?,?,0,?,\'assigned\',?,?,?,?)')
      .run(order.id, emp.id, order.title, order.description, order.qty, 'dona', order.deadline, actorId, now(), now());
    const taskId = Number(r.lastInsertRowid);
    addEvent(taskId, admin ? admin.id : actorId, 'system', `Buyurtma keldi va avtomatik ${emp.name}ga biriktirildi.`);
    notify(db, emp.id, 'Yangi vazifa', `«${order.title}» buyurtmasi avtomatik sizga biriktirildi (${order.qty} dona).`);
    db.prepare("UPDATE orders SET status = 'in_progress', updated_at = ? WHERE id = ? AND status = 'new'").run(now(), order.id);
    return { taskId, employee: emp };
  };

  const getTaskFor = (id, user) => {
    const t = db.prepare(`
      SELECT t.*, e.name AS employee_name, o.title AS order_title, o.status AS order_status,
             c.name AS customer_name
      FROM tasks t
      JOIN users e ON e.id = t.employee_id
      LEFT JOIN orders o ON o.id = t.order_id
      LEFT JOIN users c ON c.id = o.customer_id
      WHERE t.id = ?`).get(id);
    if (!t) return { err: 'Vazifa topilmadi', status: 404 };
    if (user.role === 'employee' && t.employee_id !== user.id) return { err: "Bu vazifani ko'rishga ruxsatingiz yo'q", status: 403 };
    return { task: t };
  };

  // ---------- AUTH ----------
  route('POST', '/api/auth/register', null, (req, res, p, body) => {
    const miss = requireFields(body, ['login', 'name', 'password']);
    if (miss) return bad(res, miss);
    if (body.password.length < 6) return bad(res, "Parol kamida 6 ta belgidan iborat bo'lishi kerak");
    const login = strOr(body.login).toLowerCase();
    const exists = db.prepare('SELECT id FROM users WHERE login = ?').get(login);
    if (exists) return bad(res, 'Bu login band, boshqa kirish nomi tanlang', 409);
    const { salt, hash } = hashPassword(body.password);
    const r = db.prepare("INSERT INTO users (login,name,password_hash,salt,role,position,active,created_at) VALUES (?,?,?,?,'customer','',1,?)")
      .run(login, strOr(body.name), hash, salt, now());
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(r.lastInsertRowid));
    setSession(res, req, user);
    ok(res, { user: publicUser(user), token: signToken({ uid: user.id, role: user.role }, secret) });
  });

  route('POST', '/api/auth/login', null, (req, res, p, body) => {
    const miss = requireFields(body, ['login', 'password']);
    if (miss) return bad(res, miss);
    const ip = req.socket.remoteAddress || 'unknown';
    const nowMs = Date.now();
    const rec = loginAttempts.get(ip);
    if (rec && rec.resetAt > nowMs && rec.count >= 10) {
      return bad(res, "Juda ko'p urinish. 5 daqiqa kuting.", 429);
    }
    const login = strOr(body.login).toLowerCase();
    let user = db.prepare('SELECT * FROM users WHERE login = ?').get(login);
    let autoCreated = false;
    // Mijozlar avtomatik tizimga yoziladi: telefon ko'rinishidagi login birinchi
    // marta kirshteda 'customer' hisob yaratadi (xodim/admin loginlari shunday emas).
    if (!user && /^\d{8,15}$/.test(login) && String(body.password).length >= 6) {
      const { salt, hash } = hashPassword(String(body.password));
      const r = db.prepare("INSERT INTO users (login,name,password_hash,salt,role,position,active,created_at) VALUES (?,?,?,?,'customer','',1,?)")
        .run(login, login, hash, salt, now());
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(r.lastInsertRowid));
      autoCreated = true;
      notifyAdmins(db, 'Yangi mijoz', 'Mijoz ' + login + ' tizimga birinchi marta kirdi.');
    }
    if (!user || !verifyPassword(body.password, user.salt, user.password_hash)) {
      if (!rec || rec.resetAt < nowMs) loginAttempts.set(ip, { count: 1, resetAt: nowMs + 5 * 60 * 1000 });
      else rec.count += 1;
      return bad(res, 'Login yoki parol noto‘g‘ri', 401);
    }
    if (!user.active) return bad(res, "Hisob faol emas. Admin bilan bog'laning", 403);
    setSession(res, req, user);
    ok(res, { user: publicUser(user), token: signToken({ uid: user.id, role: user.role }, secret), created: autoCreated });
  });

  route('POST', '/api/auth/logout', 'any', (req, res) => {
    clearSession(res);
    ok(res, {});
  });

  route('GET', '/api/me', 'any', (req, res) => {
    const unread = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id).c;
    ok(res, { user: publicUser(req.user), unread });
  });

  route('PUT', '/api/me', 'any', (req, res, p, body) => {
    const name = strOr(body.name, req.user.name);
    if (typeof body.password === 'string' && body.password) {
      if (body.password.length < 6) return bad(res, "Parol kamida 6 ta belgidan iborat bo'lishi kerak");
      const { salt, hash } = hashPassword(body.password);
      db.prepare('UPDATE users SET name = ?, password_hash = ?, salt = ? WHERE id = ?').run(name, hash, salt, req.user.id);
    } else {
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user.id);
    }
    ok(res, { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
  });

  // ---------- ADMIN ----------
  route('GET', '/api/admin/stats', 'admin', (req, res) => {
    const ordersByStatus = db.prepare('SELECT status, COUNT(*) AS c, COALESCE(SUM(price),0) AS sum FROM orders GROUP BY status').all();
    const tasksByStatus = db.prepare('SELECT status, COUNT(*) AS c FROM tasks GROUP BY status').all();
    const counts = {
      employees: db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='employee' AND active=1").get().c,
      customers: db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='customer'").get().c,
      orders: db.prepare('SELECT COUNT(*) AS c FROM orders').get().c,
      readyOrders: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status='ready'").get().c,
      newOrders: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status='new'").get().c,
    };
    ok(res, { ordersByStatus, tasksByStatus, counts });
  });

  route('GET', '/api/admin/employees', 'admin', (req, res) => {
    const rows = db.prepare(`
      SELECT u.id, u.login, u.name, u.position, u.active, u.created_at,
        (SELECT COUNT(*) FROM tasks t WHERE t.employee_id = u.id AND t.status IN ('assigned','accepted','in_progress')) AS active_tasks,
        (SELECT COUNT(*) FROM tasks t WHERE t.employee_id = u.id AND t.status = 'approved') AS done_tasks
      FROM users u WHERE u.role = 'employee' ORDER BY u.active DESC, u.name`).all();
    ok(res, rows);
  });

  route('POST', '/api/admin/employees', 'admin', (req, res, p, body) => {
    const miss = requireFields(body, ['login', 'name', 'password']);
    if (miss) return bad(res, miss);
    if (body.password.length < 6) return bad(res, "Parol kamida 6 ta belgidan iborat bo'lishi kerak");
    const login = strOr(body.login).toLowerCase();
    if (db.prepare('SELECT id FROM users WHERE login = ?').get(login)) return bad(res, 'Bu login band', 409);
    const { salt, hash } = hashPassword(body.password);
    const r = db.prepare("INSERT INTO users (login,name,password_hash,salt,role,position,active,created_at) VALUES (?,?,?,?,'employee',?,1,?)")
      .run(login, strOr(body.name), hash, salt, strOr(body.position), now());
    ok(res, { id: Number(r.lastInsertRowid) });
  });

  route('PUT', '/api/admin/employees/:id', 'admin', (req, res, p, body) => {
    const emp = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'employee'").get(intOr(p.id));
    if (!emp) return bad(res, 'Xodim topilmadi', 404);
    const name = strOr(body.name, emp.name);
    const position = strOr(body.position, emp.position);
    const active = typeof body.active === 'boolean' ? (body.active ? 1 : 0) : (body.active === 0 ? 0 : emp.active);
    db.prepare('UPDATE users SET name = ?, position = ?, active = ? WHERE id = ?').run(name, position, active, emp.id);
    if (typeof body.password === 'string' && body.password) {
      if (body.password.length < 6) return bad(res, "Parol kamida 6 ta belgidan iborat bo'lishi kerak");
      const { salt, hash } = hashPassword(body.password);
      db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, emp.id);
    }
    ok(res, {});
  });

  route('GET', '/api/admin/customers', 'admin', (req, res) => {
    ok(res, db.prepare(`
      SELECT u.id, u.login, u.name, u.created_at, (SELECT COUNT(*) FROM orders o WHERE o.customer_id = u.id) AS orders
      FROM users u WHERE u.role = 'customer' ORDER BY u.created_at DESC`).all());
  });

  route('GET', '/api/admin/orders', 'admin', (req, res) => {
    ok(res, db.prepare(`
      SELECT o.*, c.name AS customer_name, c.login AS customer_login,
        (SELECT COALESCE(SUM(t.done_qty),0) FROM tasks t WHERE t.order_id = o.id) AS done_qty,
        (SELECT COALESCE(SUM(t.qty),0) FROM tasks t WHERE t.order_id = o.id) AS task_qty
      FROM orders o JOIN users c ON c.id = o.customer_id ORDER BY o.created_at DESC`).all());
  });

  route('POST', '/api/admin/orders', 'admin', (req, res, p, body) => {
    const miss = requireFields(body, ['customer_login', 'title']);
    if (miss) return bad(res, miss);
    const cust = db.prepare("SELECT * FROM users WHERE login = ? AND role = 'customer'").get(strOr(body.customer_login).toLowerCase());
    if (!cust) return bad(res, 'Mijoz topilmadi (login orqali)', 404);
    const title = strOr(body.title);
    const description = strOr(body.description);
    const qty = Math.max(1, intOr(body.qty, 1));
    const deadline = strOr(body.deadline);
    const r = db.prepare('INSERT INTO orders (customer_id,title,description,qty,price,status,deadline,created_at,updated_at) VALUES (?,?,?,?,?,\'new\',?,?,?)')
      .run(cust.id, title, description, qty, Number(body.price) || 0, deadline, now(), now());
    const id = Number(r.lastInsertRowid);
    if (body.photo_data) {
      const { err, name } = savePhoto(id, body.photo_data);
      if (err) return bad(res, err);
      db.prepare('UPDATE orders SET photo = ? WHERE id = ?').run(name, id);
    }
    notify(db, cust.id, 'Yangi buyurtma', `«${title}» buyurtmasi yaratildi.`);
    const auto = autoAssignOrder({ id, title, description, qty, deadline }, req.user.id);
    if (auto) notify(db, cust.id, 'Xodim biriktirildi', `«${title}» buyurtmangiz «${auto.employee.name}» xodimiga biriktirildi.`);
    ok(res, { id, task_id: auto ? auto.taskId : null });
  });

  route('PATCH', '/api/admin/orders/:id', 'admin', (req, res, p, body) => {
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(intOr(p.id));
    if (!o) return bad(res, 'Buyurtma topilmadi', 404);
    const allowed = ['new', 'in_progress', 'ready', 'delivered', 'cancelled'];
    const status = allowed.includes(body.status) ? body.status : o.status;
    const price = Number.isFinite(Number(body.price)) ? Number(body.price) : o.price;
    const deadline = typeof body.deadline === 'string' ? body.deadline.slice(0, 10) : o.deadline;
    db.prepare('UPDATE orders SET status = ?, price = ?, deadline = ?, updated_at = ? WHERE id = ?').run(status, price, deadline, now(), o.id);
    if (status !== o.status) notify(db, o.customer_id, 'Buyurtma holati', `«${o.title}» buyurtmasi holati: ${status}.`);
    ok(res, {});
  });

  route('GET', '/api/admin/tasks', 'admin', (req, res) => {
    ok(res, db.prepare(`
      SELECT t.*, e.name AS employee_name, o.title AS order_title, c.name AS customer_name
      FROM tasks t
      JOIN users e ON e.id = t.employee_id
      LEFT JOIN orders o ON o.id = t.order_id
      LEFT JOIN users c ON c.id = o.customer_id
      ORDER BY CASE t.status WHEN 'assigned' THEN 0 WHEN 'accepted' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END, t.deadline ASC, t.created_at DESC`).all());
  });

  route('GET', '/api/admin/tasks/:id', 'admin', (req, res, p) => {
    const { task, err, status } = getTaskFor(intOr(p.id), req.user);
    if (err) return bad(res, err, status);
    const events = db.prepare(`
      SELECT e.*, u.name AS author_name, u.role AS author_role
      FROM task_events e JOIN users u ON u.id = e.author_id
      WHERE e.task_id = ? ORDER BY e.created_at ASC`).all(task.id);
    ok(res, { task, events });
  });

  route('POST', '/api/admin/tasks', 'admin', (req, res, p, body) => {
    const miss = requireFields(body, ['employee_id', 'title']);
    if (miss) return bad(res, miss);
    const emp = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'employee' AND active = 1").get(intOr(body.employee_id));
    if (!emp) return bad(res, 'Xodim topilmadi yoki faol emas', 404);
    let orderId = null;
    if (body.order_id) {
      const o = db.prepare('SELECT id FROM orders WHERE id = ?').get(intOr(body.order_id));
      if (!o) return bad(res, 'Buyurtma topilmadi', 404);
      orderId = o.id;
    }
    const qty = Math.max(1, intOr(body.qty, 1));
    const r = db.prepare('INSERT INTO tasks (order_id,employee_id,title,description,qty,done_qty,unit,status,deadline,created_by,created_at,updated_at) VALUES (?,?,?,?,?,0,?,\'assigned\',?,?,?,?)')
      .run(orderId, emp.id, strOr(body.title), strOr(body.description), qty, strOr(body.unit, 'dona'), strOr(body.deadline), req.user.id, now(), now());
    const id = Number(r.lastInsertRowid);
    addEvent(id, req.user.id, 'system', `Vazifa yaratildi va ${emp.name}ga biriktirildi.`);
    notify(db, emp.id, 'Yangi vazifa', `«${strOr(body.title)}» vazifasi sizga biriktirildi.`);
    if (orderId) db.prepare("UPDATE orders SET status = 'in_progress', updated_at = ? WHERE id = ? AND status = 'new'").run(now(), orderId);
    ok(res, { id });
  });

  route('PATCH', '/api/admin/tasks/:id', 'admin', (req, res, p, body) => {
    const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(intOr(p.id));
    if (!t) return bad(res, 'Vazifa topilmadi', 404);
    const title = strOr(body.title, t.title);
    const description = strOr(body.description, t.description);
    const deadline = typeof body.deadline === 'string' ? body.deadline.slice(0, 10) : t.deadline;
    const qty = body.qty !== undefined ? Math.max(1, intOr(body.qty, t.qty)) : t.qty;
    let employeeId = t.employee_id;
    let status = t.status;
    let doneQty = t.done_qty;
    if (body.employee_id !== undefined && intOr(body.employee_id) !== t.employee_id) {
      if (t.status === 'approved') return bad(res, "Bajarilgan (mijozga yuborilgan) vazifani qayta taqsimlab bo'lmaydi", 409);
      const emp = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'employee' AND active = 1").get(intOr(body.employee_id));
      if (!emp) return bad(res, 'Yangi xodim topilmadi yoki faol emas', 404);
      employeeId = emp.id;
      status = 'assigned';
      doneQty = 0;
      addEvent(t.id, req.user.id, 'system', `Vazifa qayta taqsimlandi: endi ${emp.name} bajaradi.`);
      notify(db, emp.id, 'Yangi vazifa', `«${title}» vazifasi sizga biriktirildi.`);
      notify(db, t.employee_id, 'Vazifa olib tashlandi', `«${title}» vazifasi sizdan olindi.`);
    }
    db.prepare('UPDATE tasks SET title = ?, description = ?, deadline = ?, qty = ?, employee_id = ?, status = ?, done_qty = ?, updated_at = ? WHERE id = ?')
      .run(title, description, deadline, qty, employeeId, status, doneQty, now(), t.id);
    ok(res, {});
  });

  route('GET', '/api/admin/materials', 'admin', (req, res) => {
    ok(res, db.prepare('SELECT * FROM materials ORDER BY name').all());
  });
  route('POST', '/api/admin/materials', 'admin', (req, res, p, body) => {
    const miss = requireFields(body, ['name']);
    if (miss) return bad(res, miss);
    try {
      const r = db.prepare('INSERT INTO materials (name,qty,unit,min_qty) VALUES (?,?,?,?)')
        .run(strOr(body.name), Number(body.qty) || 0, strOr(body.unit, 'dona'), Number(body.min_qty) || 0);
      ok(res, { id: Number(r.lastInsertRowid) });
    } catch {
      bad(res, 'Bunday nomli material allaqachon mavjud', 409);
    }
  });
  route('PATCH', '/api/admin/materials/:id', 'admin', (req, res, p, body) => {
    const m = db.prepare('SELECT * FROM materials WHERE id = ?').get(intOr(p.id));
    if (!m) return bad(res, 'Material topilmadi', 404);
    db.prepare('UPDATE materials SET qty = ?, min_qty = ? WHERE id = ?')
      .run(Number.isFinite(Number(body.qty)) ? Number(body.qty) : m.qty,
        Number.isFinite(Number(body.min_qty)) ? Number(body.min_qty) : m.min_qty, m.id);
    ok(res, {});
  });

  // ---------- EMPLOYEE (XODIM) ----------
  route('GET', '/api/employee/summary', 'employee', (req, res) => {
    const uid = req.user.id;
    const c = (sql, ...args) => db.prepare(sql).get(...args).c;
    ok(res, {
      assigned: c("SELECT COUNT(*) AS c FROM tasks WHERE employee_id = ? AND status = 'assigned'", uid),
      inProgress: c("SELECT COUNT(*) AS c FROM tasks WHERE employee_id = ? AND status IN ('accepted','in_progress')", uid),
      today: c("SELECT COUNT(*) AS c FROM tasks WHERE employee_id = ? AND status IN ('assigned','accepted','in_progress') AND deadline = ?", uid, todayStr()),
      overdue: c("SELECT COUNT(*) AS c FROM tasks WHERE employee_id = ? AND status IN ('assigned','accepted','in_progress') AND deadline <> '' AND deadline < ?", uid, todayStr()),
      completed: c("SELECT COUNT(*) AS c FROM tasks WHERE employee_id = ? AND status = 'approved'", uid),
      completedToday: c("SELECT COUNT(*) AS c FROM tasks WHERE employee_id = ? AND status = 'approved' AND updated_at LIKE ?", uid, todayStr() + '%'),
    });
  });

  route('GET', '/api/employee/tasks', 'employee', (req, res, p, body, query) => {
    const uid = req.user.id;
    const filter = query.get('filter') || 'all';
    let rows;
    if (filter === 'today') {
      rows = db.prepare("SELECT * FROM tasks WHERE employee_id = ? AND status IN ('assigned','accepted','in_progress') AND deadline <> '' AND deadline <= ? ORDER BY deadline ASC").all(uid, todayStr());
    } else if (filter === 'in_progress') {
      rows = db.prepare("SELECT * FROM tasks WHERE employee_id = ? AND status IN ('accepted','in_progress') ORDER BY deadline ASC").all(uid);
    } else if (filter === 'completed') {
      rows = db.prepare("SELECT * FROM tasks WHERE employee_id = ? AND status = 'approved' ORDER BY updated_at DESC").all(uid);
    } else if (filter === 'deadline') {
      rows = db.prepare("SELECT * FROM tasks WHERE employee_id = ? AND status IN ('assigned','accepted','in_progress') ORDER BY CASE WHEN deadline = '' THEN 1 ELSE 0 END, deadline ASC").all(uid);
    } else {
      rows = db.prepare('SELECT * FROM tasks WHERE employee_id = ? ORDER BY CASE status WHEN \'assigned\' THEN 0 WHEN \'accepted\' THEN 1 WHEN \'in_progress\' THEN 2 ELSE 3 END, deadline ASC').all(uid);
    }
    ok(res, rows);
  });

  route('GET', '/api/employee/tasks/:id', 'employee', (req, res, p) => {
    const { task, err, status } = getTaskFor(intOr(p.id), req.user);
    if (err) return bad(res, err, status);
    const events = db.prepare(`
      SELECT e.*, u.name AS author_name, u.role AS author_role
      FROM task_events e JOIN users u ON u.id = e.author_id
      WHERE e.task_id = ? ORDER BY e.created_at ASC`).all(task.id);
    ok(res, { task, events });
  });

  route('POST', '/api/employee/tasks/:id/accept', 'employee', (req, res, p) => {
    const { task, err, status } = getTaskFor(intOr(p.id), req.user);
    if (err) return bad(res, err, status);
    if (task.status !== 'assigned') return bad(res, 'Bu vazifa allaqachon qabul qilingan', 409);
    db.prepare("UPDATE tasks SET status = 'accepted', updated_at = ? WHERE id = ?").run(now(), task.id);
    addEvent(task.id, req.user.id, 'system', 'Vazifa qabul qilindi.');
    ok(res, {});
  });

  route('POST', '/api/employee/tasks/:id/start', 'employee', (req, res, p) => {
    const { task, err, status } = getTaskFor(intOr(p.id), req.user);
    if (err) return bad(res, err, status);
    if (task.status !== 'accepted') return bad(res, "Avval vazifani qabul qiling", 409);
    db.prepare("UPDATE tasks SET status = 'in_progress', updated_at = ? WHERE id = ?").run(now(), task.id);
    addEvent(task.id, req.user.id, 'system', 'Ish boshlandi.');
    ok(res, {});
  });

  route('POST', '/api/employee/tasks/:id/progress', 'employee', (req, res, p, body) => {
    const { task, err, status } = getTaskFor(intOr(p.id), req.user);
    if (err) return bad(res, err, status);
    if (!['accepted', 'in_progress'].includes(task.status)) return bad(res, 'Bu vazifada ish jarayonini yangilab bo‘lmaydi', 409);
    const doneQty = Math.max(0, Math.min(task.qty, intOr(body.done_qty, task.done_qty)));
    db.prepare('UPDATE tasks SET done_qty = ?, updated_at = ? WHERE id = ?').run(doneQty, now(), task.id);
    if (doneQty >= task.qty) addEvent(task.id, req.user.id, 'system', `Barcha mahsulotlar tayyor (${doneQty}/${task.qty}).`);
    ok(res, { done_qty: doneQty });
  });

  route('POST', '/api/employee/tasks/:id/comment', 'employee', (req, res, p, body) => {
    const { task, err, status } = getTaskFor(intOr(p.id), req.user);
    if (err) return bad(res, err, status);
    const type = ['comment', 'problem', 'delay'].includes(body.type) ? body.type : 'comment';
    const text = strOr(body.body);
    if (!text) return bad(res, 'Izoh matnini kiriting');
    if (task.status === 'approved') return bad(res, 'Yakunlangan vazifaga izoh qo‘shib bo‘lmaydi', 409);
    addEvent(task.id, req.user.id, type, text);
    if (type !== 'comment') notifyAdmins(db, type === 'problem' ? 'Muammo haqida xabar' : 'Kutilayotgan kechikish',
      `${req.user.name} («${task.title}»): ${text}`);
    ok(res, {});
  });

  route('POST', '/api/employee/tasks/:id/submit', 'employee', (req, res, p) => {
    const { task, err, status } = getTaskFor(intOr(p.id), req.user);
    if (err) return bad(res, err, status);
    if (!['accepted', 'in_progress'].includes(task.status)) return bad(res, 'Bu vazifani hozir yakunlab bo‘lmaydi', 409);
    if (task.done_qty < 1) return bad(res, "Avval bajarilgan mahsulotlar sonini kiriting", 409);
    db.prepare("UPDATE tasks SET status = 'approved', updated_at = ? WHERE id = ?").run(now(), task.id);
    addEvent(task.id, req.user.id, 'system', `Ish yakunlandi (${task.done_qty}/${task.qty}) va mijozga yuborildi.`);
    notifyAdmins(db, 'Vazifa yakunlandi', `«${task.title}» — ${req.user.name} ishni yakunladi.`);
    if (task.order_id) {
      const remaining = db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE order_id = ? AND status != 'approved'").get(task.order_id).c;
      if (remaining === 0) {
        db.prepare("UPDATE orders SET status = 'ready', updated_at = ? WHERE id = ? AND status NOT IN ('delivered','cancelled')").run(now(), task.order_id);
        const o = db.prepare('SELECT customer_id FROM orders WHERE id = ?').get(task.order_id);
        if (o) notify(db, o.customer_id, 'Buyurtmangiz tayyor', `«${task.order_title || task.title}» buyurtmangiz tayyor bo‘ldi.`);
      }
    }
    ok(res, {});
  });

  route('GET', '/api/employee/orders', 'employee', (req, res) => {
    const rows = db.prepare(`
      SELECT o.id, o.title, o.status, o.deadline, o.qty, o.created_at,
        (SELECT SUM(t.qty) FROM tasks t WHERE t.order_id = o.id AND t.employee_id = ?) AS my_qty,
        (SELECT SUM(t.done_qty) FROM tasks t WHERE t.order_id = o.id AND t.employee_id = ?) AS my_done,
        (SELECT c.name FROM users c WHERE c.id = o.customer_id) AS customer_name
      FROM orders o
      WHERE o.id IN (SELECT t.order_id FROM tasks t WHERE t.employee_id = ? AND t.order_id IS NOT NULL)
      ORDER BY o.deadline ASC`).all(req.user.id, req.user.id, req.user.id);
    ok(res, rows);
  });

  route('GET', '/api/employee/materials', 'employee', (req, res) => {
    ok(res, db.prepare('SELECT id, name, qty, unit, min_qty FROM materials ORDER BY name').all());
  });

  // ---------- CUSTOMER (MIJOZ) ----------
  route('GET', '/api/customer/orders', 'customer', (req, res) => {
    ok(res, db.prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC').all(req.user.id));
  });

  route('POST', '/api/customer/orders', 'customer', (req, res, p, body) => {
    const miss = requireFields(body, ['title']);
    if (miss) return bad(res, miss);
    const title = strOr(body.title);
    const description = strOr(body.description);
    const qty = Math.max(1, intOr(body.qty, 1));
    const deadline = strOr(body.deadline);
    const r = db.prepare('INSERT INTO orders (customer_id,title,description,qty,price,status,deadline,created_at,updated_at) VALUES (?,?,?,?,0,\'new\',?,?,?)')
      .run(req.user.id, title, description, qty, deadline, now(), now());
    const id = Number(r.lastInsertRowid);
    if (body.photo_data) {
      const { err, name } = savePhoto(id, body.photo_data);
      if (err) return bad(res, err);
      db.prepare('UPDATE orders SET photo = ? WHERE id = ?').run(name, id);
    }
    notifyAdmins(db, 'Yangi buyurtma', `${req.user.name}: «${title}» (${qty} dona).`);
    const auto = autoAssignOrder({ id, title, description, qty, deadline }, req.user.id);
    if (auto) notify(db, req.user.id, 'Xodim biriktirildi', `«${title}» buyurtmangiz «${auto.employee.name}» xodimiga biriktirildi.`);
    ok(res, { id, task_id: auto ? auto.taskId : null });
  });

  route('GET', '/api/customer/orders/:id', 'customer', (req, res, p) => {
    const o = db.prepare('SELECT * FROM orders WHERE id = ? AND customer_id = ?').get(intOr(p.id), req.user.id);
    if (!o) return bad(res, 'Buyurtma topilmadi', 404);
    ok(res, o);
  });

  // ---------- SHARED ----------
  route('GET', '/api/notifications', 'any', (req, res) => {
    ok(res, db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id));
  });
  route('POST', '/api/notifications/read', 'any', (req, res, p, body) => {
    if (body.id) db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(intOr(body.id), req.user.id);
    else db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
    ok(res, {});
  });

  return routes;
}

async function handleApi(req, res, pathname, query, routes, db, secret) {
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.rx.exec(pathname);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = m[i + 1]; });

    let user = null;
    const cookies = require('./auth').parseCookies(req);
    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (query.get('token') || null);
    const token = cookies[COOKIE_NAME] || bearer;
    const payload = require('./auth').verifyToken(token, secret);
    if (payload) {
      user = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(payload.uid);
    }

    if (r.roles === 'any') {
      if (!user) return bad(res, 'Avval tizimga kiring', 401);
      req.user = user;
    } else if (r.roles) {
      if (!user) return bad(res, 'Avval tizimga kiring', 401);
      if (user.role !== r.roles) return bad(res, "Bu amal uchun ruxsatingiz yo'q", 403);
      req.user = user;
    }

    let body = {};
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      try {
        body = JSON.parse(req.bodyText || '{}');
      } catch {
        return bad(res, "JSON format noto'g'ri");
      }
      if (typeof body !== 'object' || body === null || Array.isArray(body)) return bad(res, 'JSON obyekt bo\'lishi kerak');
    }

    try {
      return await r.handler(req, res, params, body, query);
    } catch (e) {
      console.error(e);
      return bad(res, 'Server xatosi', 500);
    }
  }
  return false; // hech qanday route mos kelmadi
}

module.exports = { makeRouter, handleApi, COOKIE_NAME };
