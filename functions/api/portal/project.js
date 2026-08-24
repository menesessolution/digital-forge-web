import { cleanText, ensureDatabase, json } from '../../lib/db.js';
import { requireClient } from '../../lib/auth.js';

export async function onRequestGet(context) {
  const auth = await requireClient(context);
  if (auth.response) return auth.response;
  const id = cleanText(new URL(context.request.url).searchParams.get('id'), 100);
  const db = await ensureDatabase(context.env);
  const project = await db.prepare('SELECT * FROM projects WHERE id=? AND client_id=?').bind(id, auth.client.id).first();
  if (!project) return json({ error: 'Proyecto no encontrado.' }, 404);
  const [versions, comments, events, settings] = await db.batch([
    db.prepare(`SELECT id,project_id,version_number,title,notes,status,original_name,content_type,size_bytes,created_at,updated_at
      FROM project_versions WHERE project_id=? ORDER BY version_number DESC`).bind(id),
    db.prepare('SELECT * FROM project_comments WHERE project_id=? ORDER BY created_at ASC LIMIT 500').bind(id),
    db.prepare('SELECT id,project_id,kind,detail,created_at FROM project_events WHERE project_id=? ORDER BY created_at DESC LIMIT 100').bind(id),
    db.prepare("SELECT key,value FROM settings WHERE key IN ('booking_url','calendly_url')"),
  ]);
  return json({ project, versions: versions.results || [], comments: comments.results || [], events: events.results || [], settings: Object.fromEntries((settings.results || []).map((item) => [item.key, item.value])) });
}
