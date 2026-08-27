import { assertSameOrigin } from '../../lib/auth.js';
import { ensureDatabase, json, nowIso } from '../../lib/db.js';

function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function privateUrl(request, token) {
  return `${new URL(request.url).origin}/pagos/?access=${encodeURIComponent(token)}`;
}

async function saveToken(db, token) {
  await db.prepare(`INSERT INTO settings (key,value,updated_at) VALUES ('payment_access_token',?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`)
    .bind(token, nowIso()).run();
  return token;
}

export async function onRequestGet({ request, env }) {
  const db = await ensureDatabase(env);
  const stored = await db.prepare("SELECT value FROM settings WHERE key='payment_access_token'").first();
  const token = stored?.value || await saveToken(db, randomToken());
  return json({ url: privateUrl(request, token) });
}

export async function onRequestPost({ request, env }) {
  assertSameOrigin(request);
  const db = await ensureDatabase(env);
  const token = await saveToken(db, randomToken());
  return json({ url: privateUrl(request, token) });
}
