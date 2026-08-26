import { ensureDatabase, json } from '../../../lib/db.js';

export async function onRequestGet({ env }) {
  const db = await ensureDatabase(env);
  const result = await db.prepare('SELECT COUNT(*) AS value FROM admin_users').first();
  return json({ setupRequired: Number(result?.value || 0) === 0 });
}
