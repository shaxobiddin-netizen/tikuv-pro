'use strict';
// Mavjud bazalarga HosilaEshmuminova xodim hisobini qo'shish/yangilash (bir martalik).
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const auth = require('../server/auth.js');

const LOGIN = 'hosilaeshmuminova'; // server loginni kichik harfda saqlaydi/qidiradi
const NAME = 'Hosila Eshmuminova';
const PASSWORD = '20132011Sh';
const ROLE = 'employee';
const POSITION = 'Tikuvchi';

function run(opts) {
  const root = path.join(__dirname, '..');
  const dbs = ['data/tikuvpro.db', 'data/tikuvpro-demo.db']
    .map((f) => path.join(root, f))
    .filter((f) => fs.existsSync(f));
  for (const f of dbs) {
    const db = new DatabaseSync(f);
    const h = auth.hashPassword(PASSWORD);
    const existing = db.prepare('SELECT id FROM users WHERE login = ?').get(LOGIN);
    if (existing) {
      db.prepare('UPDATE users SET name = ?, password_hash = ?, salt = ?, role = ?, position = ? WHERE login = ?')
        .run(NAME, h.hash, h.salt, ROLE, POSITION, LOGIN);
      console.log(`${path.relative(root, f)}: ${LOGIN} yangilandi (id=${existing.id})`);
    } else {
      const r = db.prepare(
        'INSERT INTO users (login, name, password_hash, salt, role, position, active, created_at) VALUES (?,?,?,?,?,?,1,?)'
      ).run(LOGIN, NAME, h.hash, h.salt, ROLE, POSITION, new Date().toISOString());
      console.log(`${path.relative(root, f)}: ${LOGIN} qo'shildi (id=${Number(r.lastInsertRowid)})`);
    }
    db.close();
  }
  if (!opts || !opts.noExit) process.exit(0);
}

if (require.main === module) run();
module.exports = { run };
