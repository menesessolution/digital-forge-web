import { ensureDatabase, json, nowIso } from './db.js';
import { readCookie } from './auth.js';

const encoder = new TextEncoder();
const ADMIN_COOKIE = 'df_admin_session';
const ADMIN_SESSION_SECONDS = 60 * 60 * 24 * 30;

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

export async function secretMatches(value, expected) {
  if (!value || !expected) return false;
  const [actualBytes, expectedBytes] = await Promise.all([sha256(value), sha256(expected)]);
  let difference = actualBytes.length ^ expectedBytes.length;
  const length = Math.max(actualBytes.length, expectedBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (actualBytes[index] || 0) ^ (expectedBytes[index] || 0);
  }
  return difference === 0;
}

export async function createAdminSession(env, adminId) {
  const db = await ensureDatabase(env);
  const token = randomToken();
  const sessionId = toBase64Url(await sha256(token));
  const expiresAt = Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS;
  await db.batch([
    db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(Math.floor(Date.now() / 1000)),
    db.prepare('INSERT INTO admin_sessions (id,admin_id,expires_at,created_at) VALUES (?,?,?,?)')
      .bind(sessionId, adminId, expiresAt, nowIso()),
  ]);
  return `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ADMIN_SESSION_SECONDS}`;
}

export async function destroyAdminSession(env, request) {
  const token = readCookie(request, ADMIN_COOKIE);
  if (token) {
    const db = await ensureDatabase(env);
    await db.prepare('DELETE FROM admin_sessions WHERE id=?').bind(toBase64Url(await sha256(token))).run();
  }
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function authenticateAdmin(env, request) {
  const token = readCookie(request, ADMIN_COOKIE);
  if (!token) return null;
  const db = await ensureDatabase(env);
  return db.prepare(`SELECT a.id,a.name,a.email,a.role,a.status,s.expires_at
    FROM admin_sessions s JOIN admin_users a ON a.id=s.admin_id
    WHERE s.id=? AND s.expires_at>? AND a.status='active'`)
    .bind(toBase64Url(await sha256(token)), Math.floor(Date.now() / 1000)).first();
}

export async function requireAdmin(context) {
  const admin = await authenticateAdmin(context.env, context.request);
  if (!admin) return { response: json({ error: 'Unauthorized' }, 401), admin: null };
  return { response: null, admin };
}
