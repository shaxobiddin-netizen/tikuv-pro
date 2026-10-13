'use strict';
// Mavjud bazalardagi admin hisobini yangilash uchun bir martalik skript.
// Ishlatish: node scripts/update-admin.js  (yoki REPL'dan run({noExit:true}))
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const auth = require('../server/auth.js');

const NEW_LOGIN = 'shaxobiddinumarovadmin';
const NEW_NAME = 'Shaxobiddin Umarov';
const NEW_PASSWORD = '20132011Sh';

function run(opts) {
  const root = path.join(__dirname, '..');
  const dbs = ['data/tikuvpro.db', 'data/tikuvpro-demo.db']
    .map((f) => path.join(root, f))
    .filter((f) => fs.existsSync(f));
  if (!dbs.length) console.log('Baza fayli topilmadi (data/). Seed yangi parol bilan yaratadi.');
  for (const f of dbs) {
    const db = new DatabaseSync(f);
    const h = auth.hashPassword(NEW_PASSWORD);
    const r = db.prepare(
      'UPDATE users SET login = ?, name = ?, password_hash = ?, salt = ? WHERE role = ?'
    ).run(NEW_LOGIN, NEW_NAME, h.hash, h.salt, 'admin');
    console.log(`${path.relative(root, f)}: ${r.changes} ta admin qatori yangilandi`);
    db.close();
  }
  if (!opts || !opts.noExit) process.exit(0);
}

if (require.main === module) run();
module.exports = { run };
