'use strict';
// Mavjud bazalardan Ali Valiyev va Vali Karimov hisoblarini
// (ularning vazifalari, izohlari va bildirishnomalari bilan) o'chirish.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const TARGETS = ['Ali Valiyev', 'Vali Karimov'];

function run(opts) {
  const root = path.join(__dirname, '..');
  const dbs = ['data/tikuvpro.db', 'data/tikuvpro-demo.db']
    .map((f) => path.join(root, f))
    .filter((f) => fs.existsSync(f));
  for (const f of dbs) {
    const db = new DatabaseSync(f);
    for (const name of TARGETS) {
      const u = db.prepare('SELECT id FROM users WHERE name = ?').get(name);
      if (!u) { console.log(`${path.relative(root, f)}: ${name} topilmadi`); continue; }
      const delEvents = db.prepare('DELETE FROM task_events WHERE task_id IN (SELECT id FROM tasks WHERE employee_id = ?)').run(u.id);
      const delAuthored = db.prepare('DELETE FROM task_events WHERE author_id = ?').run(u.id);
      const delTasks = db.prepare('DELETE FROM tasks WHERE employee_id = ?').run(u.id);
      const delNotif = db.prepare('DELETE FROM notifications WHERE user_id = ?').run(u.id);
      const delUser = db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
      console.log(`${path.relative(root, f)}: ${name} o'chirildi (vazifalar=${delTasks.changes}, izohlar=${delEvents.changes + delAuthored.changes}, bildirishnomalar=${delNotif.changes}, user=${delUser.changes})`);
    }
    db.close();
  }
  if (!opts || !opts.noExit) process.exit(0);
}

if (require.main === module) run();
module.exports = { run };
