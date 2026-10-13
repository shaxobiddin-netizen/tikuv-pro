'use strict';
// API smoke-testi: alohida vaqtinchalik serverda to'liq biznes oqimlarini tekshiradi.
// Ishga tushirish: npm test
const path = require('node:path');
const { createServer } = require(path.join(__dirname, '..', 'server', 'index.js'));

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name); }
}

async function run(opts) {
  opts = opts || {};
  const { server } = createServer({ dbPath: ':memory:', secret: 'smoke-secret' });
  await new Promise((r) => server.listen(0, r));
  const B = 'http://127.0.0.1:' + server.address().port;
  const jars = {};
  async function call(who, method, pth, body) {
    const res = await fetch(B + pth, {
      method,
      headers: { 'Content-Type': 'application/json', ...(jars[who] ? { Cookie: jars[who] } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = res.headers.get('set-cookie');
    if (sc && who) jars[who] = sc.split(';')[0];
    let json = null;
    try { json = await res.json(); } catch { /* bo'sh */ }
    return { status: res.status, json };
  }

  console.log('\n[1] Autentifikatsiya');
  for (const [who, login, pass, role] of [
    ['admin', 'shaxobiddinumarovadmin', '20132011Sh', 'admin'],
    ['hosila', 'hosilaeshmuminova', '20132011Sh', 'employee'],
    ['cust', '901234567', 'Mijoz123!', 'customer'],
  ]) {
    const r = await call(who, 'POST', '/api/auth/login', { login, password: pass });
    check(`${role} login`, r.status === 200 && r.json.data.user.role === role);
  }
  const crtEmp = await call('admin', 'POST', '/api/admin/employees', { login: 'testemp', name: 'Test Xodim', password: 'Test12345!', position: 'Kesimchi' });
  check('admin xodim yaratadi', crtEmp.status === 200);
  const emp2 = await call('emp2', 'POST', '/api/auth/login', { login: 'testemp', password: 'Test12345!' });
  check('ikkinchi xodim login', emp2.status === 200 && emp2.json.data.user.role === 'employee');
  const bad = await call(null, 'POST', '/api/auth/login', { login: 'admin', password: 'x' });
  check('xato parol rad etiladi', bad.status === 401);
  const reg = await call('newc', 'POST', '/api/auth/register', { login: '991234567', name: 'Test', password: 'Parol123' });
  const regMe = await call('newc', 'GET', '/api/me');
  check("ro'yxatdan o'tish faqat mijoz", reg.status === 200 && regMe.json.data.user.role === 'customer');

  console.log("\n[1b] Mijoz avto-ro'yxat va rol himoyasi");
  const auto = await call('auto', 'POST', '/api/auth/login', { login: '991112233', password: 'MeningParol1' });
  check('telefon bilan birinchi kirishda mijoz avtomatik saqlanadi', auto.status === 200 && auto.json.data.user.role === 'customer');
  const auto2 = await call('auto', 'POST', '/api/auth/login', { login: '991112233', password: 'MeningParol1' });
  check('avtomatik hisob qayta login qiladi', auto2.status === 200 && auto2.json.data.user.id === auto.json.data.user.id);
  const autoWrong = await call(null, 'POST', '/api/auth/login', { login: '991112233', password: 'BoshqaParol1' });
  check('avtomatik hisobda parol tekshiriladi', autoWrong.status === 401);
  check('avtomatik mijoz admin bo\'limiga kira olmaydi', (await call('auto', 'GET', '/api/admin/employees')).status === 403);
  const typoEmp = await call(null, 'POST', '/api/auth/login', { login: 'hosilaeshmuminov', password: 'BirorParol1' });
  check('xato yozilgan xodim logini hisob yaratmaydi', typoEmp.status === 401);
  const typoAdmin = await call(null, 'POST', '/api/auth/login', { login: 'shaxobiddinumarov', password: 'BirorParol1' });
  check('xato yozilgan admin logini hisob yaratmaydi', typoAdmin.status === 401);
  const hijack = await call('hij', 'POST', '/api/auth/register', { login: 'shaxobiddinumarovadmin', name: 'Soxta', password: 'Soxta123' });
  check('admin loginini qayta ro\'yxatdan o\'tkozib bo\'lmaydi', hijack.status === 409);

  console.log('\n[2] Ruxsatlar (backend himoyasi)');
  check('xodim admin stats ololmaydi', (await call('hosila', 'GET', '/api/admin/stats')).status === 403);
  check('xodim xodimlar ro\'yxatini ololmaydi', (await call('hosila', 'GET', '/api/admin/employees')).status === 403);
  check('xodim barcha buyurtmalarni ololmaydi', (await call('hosila', 'GET', '/api/admin/orders')).status === 403);
  check('mijoz xodim vazifalarini ololmaydi', (await call('cust', 'GET', '/api/employee/tasks')).status === 403);
  check('mehmon API dan foydalana olmaydi', (await call(null, 'GET', '/api/employee/tasks')).status === 401);
  check('xodim material o\'zgartira olmaydi', (await call('hosila', 'POST', '/api/admin/materials', { name: 'X' })).status === 403);

  console.log('\n[3] Xodim vazifa sikli');
  const crt = await call('admin', 'POST', '/api/admin/tasks', { employee_id: 2, title: 'Smoke vazifa', qty: 5, deadline: '2026-10-20' });
  check('admin vazifa yaratadi', crt.status === 200);
  const tid = crt.json.data.id;
  check('xodimga bildirishnoma bordi', (await call('hosila', 'GET', '/api/notifications')).json.data.some((n) => n.title === 'Yangi vazifa'));
  check('qabul qilish', (await call('hosila', 'POST', `/api/employee/tasks/${tid}/accept`)).status === 200);
  check('boshlash', (await call('hosila', 'POST', `/api/employee/tasks/${tid}/start`)).status === 200);
  const prog = await call('hosila', 'POST', `/api/employee/tasks/${tid}/progress`, { done_qty: 3 });
  check('jarayon yangilash', prog.status === 200 && prog.json.data.done_qty === 3);
  check('muammo izohi', (await call('hosila', 'POST', `/api/employee/tasks/${tid}/comment`, { type: 'problem', body: 'Test muammo' })).status === 200);
  check('admin muammo haqida xabar oldi', (await call('admin', 'GET', '/api/notifications')).json.data.some((n) => n.title === 'Muammo haqida xabar'));
  check('yakunlash', (await call('hosila', 'POST', `/api/employee/tasks/${tid}/submit`)).status === 200);
  const fin = await call('hosila', 'GET', `/api/employee/tasks/${tid}`);
  check('vazifa darhol "approved" bo\'ladi (tasdiq bosqichisiz)', fin.json.data.task.status === 'approved');
  check('tarixda mijozga yuborildi yozuvi', fin.json.data.events.some((e) => e.body.includes('mijozga yuborildi')));
  check('admin yakunlanish haqida xabar oldi', (await call('admin', 'GET', '/api/notifications')).json.data.some((n) => n.title === 'Vazifa yakunlandi'));
  check('boshqa xodim vazifaga aralasha olmaydi', (await call('emp2', 'GET', `/api/employee/tasks/${tid}`)).status === 403);
  check('eski admin tasdiq marshruti olib tashlangan', (await call('admin', 'POST', `/api/admin/tasks/${tid}/decide`, { action: 'approve' })).status === 404);

  console.log('\n[4] Qayta taqsimlash');
  const t3 = (await call('admin', 'POST', '/api/admin/tasks', { employee_id: 2, title: 'Taqsimlanadigan', qty: 1 })).json.data.id;
  check('qayta taqsimlash', (await call('admin', 'PATCH', `/api/admin/tasks/${t3}`, { employee_id: 4 })).status === 200);
  const vTasks = await call('emp2', 'GET', '/api/employee/tasks');
  check('yangi xodim vazifani ko\'radi', vTasks.json.data.some((t) => t.id === t3 && t.status === 'assigned'));
  check('bajarilgan vazifani qayta taqsimlab bo\'lmaydi', (await call('admin', 'PATCH', `/api/admin/tasks/${tid}`, { employee_id: 4 })).status === 409);

  console.log('\n[5] Buyurtmalar (umumiy baza)');
  const oc = await call('cust', 'POST', '/api/customer/orders', { title: 'Smoke buyurtma', qty: 2 });
  check('mijoz buyurtma yaratadi', oc.status === 200);
  const oid = oc.json.data.id;
  const adminOrders = await call('admin', 'GET', '/api/admin/orders');
  check('admin buyurtmani ko\'radi', adminOrders.json.data.some((o) => o.id === oid));
  check('admin holat+narx', (await call('admin', 'PATCH', `/api/admin/orders/${oid}`, { status: 'in_progress', price: 500000 })).status === 200);
  const custOrders = await call('cust', 'GET', '/api/customer/orders');
  const myOrder = custOrders.json.data.find((o) => o.id === oid);
  check('mijoz yangi holatni ko\'radi', myOrder && myOrder.status === 'in_progress');
  check('mijozga bildirishnoma', (await call('cust', 'GET', '/api/notifications')).json.data.length > 0);
  check('mijoz boshqa mijoz buyurtmasini ko\'rmaydi', !(await call('newc', 'GET', '/api/customer/orders')).json.data.some((o) => o.id === oid));
  await call('cust', 'POST', '/api/notifications/read', {});
  check('bildirishnomalar o\'qildi deb belgilandi', (await call('cust', 'GET', '/api/me')).json.data.unread === 0);

  console.log('\n[5b] Buyurtma avtomatik xodimga biriktiriladi');
  const autoTasks = (await call('admin', 'GET', '/api/admin/tasks')).json.data.filter((t) => t.order_id === oid);
  check('buyurtma avtomatik vazifa ochadi', autoTasks.length === 1);
  const autoTask = autoTasks[0];
  check('eng kam yuklangan xodim tanlanadi (testemp)', !!autoTask && autoTask.employee_id === 4 && autoTask.status === 'assigned' && autoTask.qty === 2);
  check('biriktirilgan xodim vazifani ko\'radi', !!autoTask && (await call('emp2', 'GET', '/api/employee/tasks')).json.data.some((t) => t.id === autoTask.id));
  check('xodimga avtomatik biriktirish xabari bordi', (await call('emp2', 'GET', '/api/notifications')).json.data.some((n) => n.title === 'Yangi vazifa' && n.body.includes('avtomatik')));
  const autoEvents = (await call('admin', 'GET', `/api/admin/tasks/${autoTask.id}`)).json.data.events;
  check('vazifa tarixida avtomatik yozuvi bor', autoEvents.some((e) => e.type === 'system' && e.body.includes('avtomatik')));
  check('mijoz biriktirish xabarini oldi', (await call('cust', 'GET', '/api/notifications')).json.data.some((n) => n.title === 'Xodim biriktirildi'));
  await call('emp2', 'POST', `/api/employee/tasks/${autoTask.id}/accept`);
  await call('emp2', 'POST', `/api/employee/tasks/${autoTask.id}/start`);
  await call('emp2', 'POST', `/api/employee/tasks/${autoTask.id}/progress`, { done_qty: 2 });
  check('avto-vazifa yakunlanadi', (await call('emp2', 'POST', `/api/employee/tasks/${autoTask.id}/submit`)).status === 200);
  const oidAfter = (await call('admin', 'GET', '/api/admin/orders')).json.data.find((o) => o.id === oid);
  check('buyurtma avtomatik "tayyor" bo\'ladi', oidAfter && oidAfter.status === 'ready');
  check('mijoz "Buyurtmangiz tayyor" xabarini oldi', (await call('cust', 'GET', '/api/notifications')).json.data.some((n) => n.title === 'Buyurtmangiz tayyor'));
  await call('admin', 'PUT', '/api/admin/employees/2', { active: false });
  await call('admin', 'PUT', '/api/admin/employees/4', { active: false });
  const orphan = await call('cust', 'POST', '/api/customer/orders', { title: 'Xodimsiz buyurtma', qty: 1 });
  check('xodimsiz holatda buyurtma baribir qabul qilinadi', orphan.status === 200);
  const orphanTasks = (await call('admin', 'GET', '/api/admin/tasks')).json.data.filter((t) => t.order_id === orphan.json.data.id);
  check('xodimsiz holatda vazifa ochilmaydi', orphanTasks.length === 0);
  const orphanOrder = (await call('admin', 'GET', '/api/admin/orders')).json.data.find((o) => o.id === orphan.json.data.id);
  check('xodimsiz buyurtma "new" holatida qoladi', orphanOrder && orphanOrder.status === 'new');
  check('admin "Xodim biriktirilmadi" xabarini oladi', (await call('admin', 'GET', '/api/notifications')).json.data.some((n) => n.title === 'Xodim biriktirilmadi'));
  await call('admin', 'PUT', '/api/admin/employees/2', { active: true });
  await call('admin', 'PUT', '/api/admin/employees/4', { active: true });

  console.log('\n[6] Xodim ko\'rinishlari');
  const empOrders = await call('hosila', 'GET', '/api/employee/orders');
  check('xodim faqat o\'z buyurtmalarini ko\'radi', empOrders.status === 200 && empOrders.json.data.every((o) => o.my_qty > 0));
  check('moliyaviy ma\'lumot yo\'q', empOrders.json.data.every((o) => o.price === undefined));
  const mats = await call('hosila', 'GET', '/api/employee/materials');
  check('materiallar o\'qiladi', mats.status === 200 && mats.json.data.length >= 4);
  const summary = await call('hosila', 'GET', '/api/employee/summary');
  check('xodim summary', summary.status === 200 && typeof summary.json.data.completed === 'number');

  server.close();
  console.log('\n========================================');
  console.log(`Natija: ${passed} ta o'tdi, ${failed} ta xato`);
  console.log('========================================');
  if (!opts.noExit) process.exit(failed ? 1 : 0);
  return failed;
}

if (require.main === module) {
  run().catch((e) => { console.error('Smoke-test xatosi:', e); process.exit(1); });
}

module.exports = { run };
