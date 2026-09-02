import { cleanText, ensureDatabase, json } from '../../lib/db.js';
import { requireClient } from '../../lib/auth.js';
import { loadProjectMessages, publicMessages } from '../../lib/project-message.js';

export async function onRequestGet(context) {
  const auth = await requireClient(context);
  if (auth.response) return auth.response;
  const id = cleanText(new URL(context.request.url).searchParams.get('id'), 100);
  const db = await ensureDatabase(context.env);
  const project = await db.prepare(`SELECT id,title,service,status,progress,due_date,description,payment_amount_cents,
    payment_currency,payment_status,created_at,updated_at FROM projects WHERE id=? AND client_id=?`).bind(id, auth.client.id).first();
  if (!project) return json({ error: 'Proyecto no encontrado.' }, 404);
  const [batch,messages] = await Promise.all([db.batch([
    db.prepare(`SELECT id,project_id,version_number,title,notes,status,original_name,content_type,size_bytes,created_at,updated_at
      FROM project_versions WHERE project_id=? ORDER BY version_number DESC`).bind(id),
    db.prepare(`SELECT id,project_id,original_name,content_type,size_bytes,status,created_at
      FROM project_materials WHERE project_id=? ORDER BY created_at DESC`).bind(id),
    db.prepare('SELECT id,project_id,kind,detail,created_at FROM project_events WHERE project_id=? ORDER BY created_at DESC LIMIT 100').bind(id),
    db.prepare("SELECT key,value FROM settings WHERE key IN ('booking_url','calendly_url')"),
  ]),loadProjectMessages(db,id)]);
  return json({ project, versions: batch[0].results || [], materials: batch[1].results || [], comments: publicMessages(messages,'client'), events: batch[2].results || [], settings: Object.fromEntries((batch[3].results || []).map((item) => [item.key, item.value])) });
}
