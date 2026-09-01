import { assertSameOrigin, requireClient } from '../../lib/auth.js';
import { cleanText, ensureDatabase, json, nowIso } from '../../lib/db.js';

export async function onRequestGet(context) {
  const auth = await requireClient(context);
  if (auth.response) return auth.response;
  const db = await ensureDatabase(context.env);
  const result = await db.prepare(`SELECT id,project_id,kind,title,body,read_at,created_at FROM project_notifications
    WHERE recipient_role='client' AND recipient_id=? ORDER BY created_at DESC LIMIT 80`).bind(auth.client.id).all();
  return json({ notifications: result.results || [] });
}

export async function onRequestPatch(context) {
  const auth = await requireClient(context);
  if (auth.response) return auth.response;
  try {
    assertSameOrigin(context.request);
    const body = await context.request.json();
    const id = cleanText(body.id,100);
    const db = await ensureDatabase(context.env);
    if (id) await db.prepare(`UPDATE project_notifications SET read_at=? WHERE id=? AND recipient_role='client' AND recipient_id=?`).bind(nowIso(),id,auth.client.id).run();
    else await db.prepare(`UPDATE project_notifications SET read_at=? WHERE recipient_role='client' AND recipient_id=? AND read_at=''`).bind(nowIso(),auth.client.id).run();
    return json({ ok: true });
  } catch (error) {
    return json({ error: error.message || 'No se pudo actualizar la notificación.' },400);
  }
}
