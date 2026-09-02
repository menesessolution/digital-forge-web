import { cleanText, ensureDatabase, json } from '../../lib/db.js';
import { loadProjectMessages } from '../../lib/project-message.js';

export async function onRequestGet({ request, env }) {
  const id = cleanText(new URL(request.url).searchParams.get('id'), 100);
  const db = await ensureDatabase(env);
  const project = await db.prepare(`SELECT p.*,c.name AS client_name,c.email AS client_email,
    e.name AS editor_name,e.alias AS editor_alias,e.email AS editor_email
    FROM projects p JOIN clients c ON c.id=p.client_id LEFT JOIN editors e ON e.id=p.editor_id WHERE p.id=?`).bind(id).first();
  if (!project) return json({ error: 'Proyecto no encontrado.' }, 404);
  const [batch,messages] = await Promise.all([db.batch([
    db.prepare('SELECT * FROM project_versions WHERE project_id=? ORDER BY version_number DESC').bind(id),
    db.prepare('SELECT id,project_id,client_id,original_name,display_name,content_type,size_bytes,status,created_at FROM project_materials WHERE project_id=? ORDER BY created_at DESC').bind(id),
    db.prepare('SELECT * FROM project_events WHERE project_id=? ORDER BY created_at DESC LIMIT 100').bind(id),
  ]),loadProjectMessages(db,id)]);
  const comments = messages.map((item) => ({ ...item, author_role: item.sender_role, author_name: item.author_label || (item.sender_role === 'admin' ? 'Digital Forge' : item.sender_role === 'editor' ? 'Equipo de edición' : 'Cliente') }));
  return json({ project, versions: batch[0].results || [], materials: batch[1].results || [], comments, events: batch[2].results || [] });
}
