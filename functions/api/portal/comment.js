import { cleanText, ensureDatabase, json, makeId, nowIso } from '../../lib/db.js';
import { assertSameOrigin, requireClient } from '../../lib/auth.js';

export async function onRequestPost(context) {
  const auth = await requireClient(context);
  if (auth.response) return auth.response;
  try {
    assertSameOrigin(context.request);
    const body = await context.request.json();
    const projectId = cleanText(body.project_id, 100);
    const versionId = cleanText(body.version_id, 100);
    const message = cleanText(body.message, 3000);
    if (!message) return json({ error: 'Escribe un comentario.' }, 400);
    const db = await ensureDatabase(context.env);
    const project = await db.prepare('SELECT id FROM projects WHERE id=? AND client_id=?').bind(projectId, auth.client.id).first();
    if (!project) return json({ error: 'Proyecto no encontrado.' }, 404);
    if (versionId) {
      const version = await db.prepare('SELECT id FROM project_versions WHERE id=? AND project_id=?').bind(versionId, projectId).first();
      if (!version) return json({ error: 'Versión no encontrada.' }, 404);
    }
    const now = nowIso();
    await db.batch([
      db.prepare(`INSERT INTO project_comments
        (id,project_id,version_id,client_id,author_role,author_name,message,created_at) VALUES (?,?,?,?,?,?,?,?)`)
        .bind(makeId('comment'),projectId,versionId,auth.client.id,'client',auth.client.name,message,now),
      db.prepare('INSERT INTO project_events (project_id,kind,detail,created_at) VALUES (?,?,?,?)')
        .bind(projectId,'client_comment','Nuevo comentario del cliente',now),
      db.prepare('UPDATE projects SET updated_at=? WHERE id=?').bind(now,projectId),
    ]);
    return json({ ok: true }, 201);
  } catch (error) {
    return json({ error: error.message || 'No se pudo guardar el comentario.' }, 400);
  }
}
