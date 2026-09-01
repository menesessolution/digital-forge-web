import { assertSameOrigin } from '../../lib/auth.js';
import { cleanText, ensureDatabase, json, nowIso } from '../../lib/db.js';

const allowedStages = new Set(['new','contacted','proposal','active','completed','archived']);

export async function onRequestGet({ request, env }) {
  const db = await ensureDatabase(env);
  const url = new URL(request.url);
  const stage = cleanText(url.searchParams.get('stage'), 30);
  const search = cleanText(url.searchParams.get('q'), 120);
  let sql = 'SELECT * FROM leads WHERE 1=1';
  const values = [];
  if (stage && allowedStages.has(stage)) { sql += ' AND stage = ?'; values.push(stage); }
  if (search) { sql += ' AND (name LIKE ? OR email LIKE ? OR service LIKE ?)'; const term = `%${search}%`; values.push(term, term, term); }
  sql += ' ORDER BY created_at DESC LIMIT 300';
  const result = await db.prepare(sql).bind(...values).all();
  return json({ leads: result.results || [] });
}

export async function onRequestPatch({ request, env }) {
  assertSameOrigin(request);
  const db = await ensureDatabase(env);
  const body = await request.json();
  const id = cleanText(body.id, 100);
  const stage = cleanText(body.stage, 30);
  const notes = cleanText(body.notes, 5000);
  if (!id || !allowedStages.has(stage)) return json({ error: 'Invalid lead update' }, 400);
  const result = await db.prepare('UPDATE leads SET stage = ?, notes = ?, updated_at = ? WHERE id = ?')
    .bind(stage, notes, nowIso(), id).run();
  if (!result.meta?.changes) return json({ error: 'Lead not found' }, 404);
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  try {
    assertSameOrigin(request);
    const body = await request.json();
    const id = cleanText(body.id, 100);
    if (!id) return json({ error: 'Contacto no válido.' }, 400);
    const db = await ensureDatabase(env);
    const result = await db.prepare('DELETE FROM leads WHERE id = ?').bind(id).run();
    if (!result.meta?.changes) return json({ error: 'Contacto no encontrado.' }, 404);
    return json({ ok: true });
  } catch (error) {
    return json({ error: error.message || 'No se pudo eliminar el contacto.' }, 400);
  }
}
