import { cleanText, ensureDatabase, json, nowIso } from '../../lib/db.js';
import { assertSameOrigin } from '../../lib/auth.js';
import { messageInsert, moderateProjectMessage, notificationInsert } from '../../lib/project-message.js';

export async function onRequestPost({ request, env, data }) {
  try {
    assertSameOrigin(request);
    const body = await request.json();
    const projectId = cleanText(body.project_id, 100);
    const versionId = cleanText(body.version_id, 100);
    const message = moderateProjectMessage(body.message);
    if (!projectId || !message) return json({ error: 'Proyecto y comentario son requeridos.' }, 400);
    const db = await ensureDatabase(env);
    const project = await db.prepare('SELECT id,client_id,editor_id,public_code FROM projects WHERE id=?').bind(projectId).first();
    if (!project) return json({ error: 'Proyecto no encontrado.' }, 404);
    if (versionId) {
      const version = await db.prepare('SELECT id FROM project_versions WHERE id=? AND project_id=?').bind(versionId, projectId).first();
      if (!version) return json({ error: 'Versión no encontrada.' }, 404);
    }
    const now = nowIso();
    const statements = [
      messageInsert(db,{ projectId,versionId,senderRole:'admin',senderId:data.admin.id,authorLabel:data.admin.name || 'Digital Forge',message }),
      notificationInsert(db,{ recipientRole:'client',recipientId:project.client_id,projectId,kind:'admin_message',title:'Nuevo mensaje de Digital Forge',body:project.public_code || 'Tu proyecto tiene una actualización.' }),
      db.prepare('INSERT INTO project_events (project_id,kind,detail,created_at) VALUES (?,?,?,?)')
        .bind(projectId,'admin_comment','Nuevo comentario de Digital Forge',now),
      db.prepare('UPDATE projects SET updated_at=? WHERE id=?').bind(now,projectId),
    ];
    if (project.editor_id) statements.push(notificationInsert(db,{ recipientRole:'editor',recipientId:project.editor_id,projectId,kind:'admin_message',title:'Mensaje de coordinación',body:project.public_code || 'Proyecto actualizado' }));
    await db.batch(statements);
    return json({ ok: true }, 201);
  } catch (error) {
    return json({ error: error.message || 'No se pudo guardar el comentario.' }, 400);
  }
}
