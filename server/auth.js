'use strict';
// Parol xeshlash (scrypt) va imzolangan sessiya tokenlari (HMAC-SHA256).
const crypto = require('node:crypto');

const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 kun

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64, SCRYPT_OPTS).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  try {
    const test = crypto.scryptSync(String(password), salt, 64, SCRYPT_OPTS);
    const ref = Buffer.from(hash, 'hex');
    return test.length === ref.length && crypto.timingSafeEqual(test, ref);
  } catch {
    return false;
  }
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function signToken(payload, secret) {
  const body = b64url(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_TTL_MS }));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const i = token.lastIndexOf('.');
  if (i <= 0) return null;
  const body = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expect = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function randomSecret() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, parseCookies, randomSecret, TOKEN_TTL_MS };
