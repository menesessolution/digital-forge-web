import { cleanText, ensureDatabase, json } from '../../lib/db.js';

export async function onRequestGet({ request, env }) {
  const id = cleanText(new URL(request.url).searchParams.get('id'), 100);
  const db = await ensureDatabase(env);
  const project = await db.prepare(`SELECT p.*,c.name AS client_name,c.email AS client_email
    FROM projects p JOIN clients c ON c.id=p.client_id WHERE p.id=?`).bind(id).first();
  if (!project) return json({ error: 'Proyecto no encontrado.' }, 404);
  const [versions, comments, events] = await db.batch([
    db.prepare('SELECT * FROM project_versions WHERE project_id=? ORDER BY version_number DESC').bind(id),
    db.prepare('SELECT * FROM project_comments WHERE project_id=? ORDER BY created_at ASC LIMIT 500').bind(id),
    db.prepare('SELECT * FROM project_events WHERE project_id=? ORDER BY created_at DESC LIMIT 100').bind(id),
  ]);
  return json({ project, versions: versions.results || [], comments: comments.results || [], events: events.results || [] });
}
