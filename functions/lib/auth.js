import { cleanText, ensureDatabase, json, nowIso } from './db.js';

const encoder = new TextEncoder();
const SESSION_COOKIE = 'df_client_session';
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const PASSWORD_ITERATIONS = 210000;

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function passwordBits(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_ITERATIONS }, key, 256);
  return new Uint8Array(bits);
}

function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export function normalizeEmail(value) {
  return cleanText(value, 254).toLowerCase();
}

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) {
    throw new Error('La contraseña debe tener al menos 12 caracteres.');
  }
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return { hash: toBase64Url(await passwordBits(password, salt)), salt: toBase64Url(salt) };
}

export async function verifyPassword(password, expectedHash, encodedSalt) {
  try {
    const actual = await passwordBits(String(password || ''), fromBase64Url(encodedSalt));
    return equalBytes(actual, fromBase64Url(expectedHash));
  } catch {
    return false;
  }
}

export async function burnPasswordCheck(password) {
  const salt = new Uint8Array(16);
  await passwordBits(String(password || ''), salt);
}

export function assertSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new Error('Origen no permitido.');
}

export function readCookie(request, name = SESSION_COOKIE) {
  const header = request.headers.get('cookie') || '';
  for (const item of header.split(';')) {
    const [key, ...parts] = item.trim().split('=');
    if (key === name) return decodeURIComponent(parts.join('='));
  }
  return '';
}

export async function createSession(env, clientId) {
  const db = await ensureDatabase(env);
  const token = randomToken();
  const sessionId = toBase64Url(await sha256(token));
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  await db.batch([
    db.prepare('DELETE FROM client_sessions WHERE expires_at <= ?').bind(Math.floor(Date.now() / 1000)),
    db.prepare('INSERT INTO client_sessions (id,client_id,expires_at,created_at) VALUES (?,?,?,?)')
      .bind(sessionId, clientId, expiresAt, nowIso()),
  ]);
  return {
    token,
    cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`,
  };
}

export async function destroySession(env, request) {
  const token = readCookie(request);
  if (token) {
    const db = await ensureDatabase(env);
    await db.prepare('DELETE FROM client_sessions WHERE id = ?').bind(toBase64Url(await sha256(token))).run();
  }
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function authenticateClient(env, request) {
  const token = readCookie(request);
  if (!token) return null;
  const db = await ensureDatabase(env);
  const sessionId = toBase64Url(await sha256(token));
  return db.prepare(`SELECT c.id,c.name,c.email,c.locale,c.status,s.expires_at
    FROM client_sessions s JOIN clients c ON c.id=s.client_id
    WHERE s.id=? AND s.expires_at>? AND c.status='active'`)
    .bind(sessionId, Math.floor(Date.now() / 1000)).first();
}

export async function requireClient(context) {
  const client = await authenticateClient(context.env, context.request);
  if (!client) return { response: json({ error: 'Unauthorized' }, 401), client: null };
  return { response: null, client };
}

export async function hashIp(request) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  return toBase64Url(await sha256(ip));
}
