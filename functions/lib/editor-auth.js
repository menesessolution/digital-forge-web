import { ensureDatabase, json, nowIso } from './db.js';
import { readCookie } from './auth.js';

const encoder = new TextEncoder();
const EDITOR_COOKIE = 'df_editor_session';
const SESSION_SECONDS = 60 * 60 * 24 * 14;

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

export async function createEditorSession(env, editorId) {
  const db = await ensureDatabase(env);
  const token = randomToken();
  const sessionId = toBase64Url(await sha256(token));
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  await db.batch([
    db.prepare('DELETE FROM editor_sessions WHERE expires_at<=?').bind(Math.floor(Date.now() / 1000)),
    db.prepare('INSERT INTO editor_sessions (id,editor_id,expires_at,created_at) VALUES (?,?,?,?)')
      .bind(sessionId,editorId,expiresAt,nowIso()),
  ]);
  return `${EDITOR_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}

export async function destroyEditorSession(env, request) {
  const token = readCookie(request, EDITOR_COOKIE);
  if (token) {
    const db = await ensureDatabase(env);
    await db.prepare('DELETE FROM editor_sessions WHERE id=?').bind(toBase64Url(await sha256(token))).run();
  }
  return `${EDITOR_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function authenticateEditor(env, request) {
  const token = readCookie(request, EDITOR_COOKIE);
  if (!token) return null;
  const db = await ensureDatabase(env);
  return db.prepare(`SELECT e.id,e.name,e.alias,e.email,e.status,e.must_change_password,s.expires_at
    FROM editor_sessions s JOIN editors e ON e.id=s.editor_id
    WHERE s.id=? AND s.expires_at>? AND e.status='active'`)
    .bind(toBase64Url(await sha256(token)),Math.floor(Date.now() / 1000)).first();
}

export async function requireEditor(context) {
  const editor = await authenticateEditor(context.env, context.request);
  if (!editor) return { response: json({ error: 'Unauthorized' }, 401), editor: null };
  return { response: null, editor };
}
