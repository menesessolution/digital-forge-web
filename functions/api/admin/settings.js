import { cleanText, ensureDatabase, json, nowIso } from '../../lib/db.js';

const allowedKeys = new Set(['paypal_url','calendly_url','contact_email']);

export async function onRequestGet({ env }) {
  const db = await ensureDatabase(env);
  const result = await db.prepare('SELECT key,value FROM settings ORDER BY key').all();
  return json({ settings: Object.fromEntries((result.results || []).map((item) => [item.key, item.value])) });
}

export async function onRequestPut({ request, env }) {
  const body = await request.json();
  const db = await ensureDatabase(env);
  const now = nowIso();
  const statements = Object.entries(body)
    .filter(([key]) => allowedKeys.has(key))
    .map(([key, value]) => db.prepare(`INSERT INTO settings (key,value,updated_at) VALUES (?,?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`)
      .bind(key, cleanText(value, 1000), now));
  if (!statements.length) return json({ error: 'No valid settings provided' }, 400);
  await db.batch(statements);
  return json({ ok: true });
}
