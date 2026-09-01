import { assertSameOrigin } from '../../lib/auth.js';
import { cleanText, ensureDatabase, json, nowIso } from '../../lib/db.js';
import { messageInsert, moderateProjectMessage, notificationInsert } from '../../lib/project-message.js';

export async function onRequestPost({ request, env, data }) {
  try {
    assertSameOrigin(request);
    const body = await request.json();
    const projectId = cleanText(body.project_id,100);
    const versionId = cleanText(body.version_id,100);
    const message = moderateProjectMessage(body.message);
    const rawTime = Number(body.time_seconds);
    const timeSeconds = versionId && Number.isFinite(rawTime) ? Math.max(0,Math.min(Math.floor(rawTime),86400)) : -1;
    const db = await ensureDatabase(env);
    const project = await db.prepare('SELECT id,client_id,public_code FROM projects WHERE id=? AND editor_id=?').bind(projectId,data.editor.id).first();
    if (!project) return json({ error: 'Proyecto no encontrado.' },404);
    if (versionId) {
      const version = await db.prepare('SELECT id FROM project_versions WHERE id=? AND project_id=?').bind(versionId,projectId).first();
      if (!version) return json({ error: 'Versión no encontrada.' },404);
    }
    const now = nowIso();
    await db.batch([
      messageInsert(db,{ projectId,versionId,senderRole:'editor',senderId:data.editor.id,authorLabel:data.editor.name,message,timeSeconds }),
      notificationInsert(db,{ recipientRole:'client',recipientId:project.client_id,projectId,kind:'editor_message',title:'Nuevo mensaje del equipo de edición',body:project.public_code || 'Tu proyecto tiene una actualización.' }),
      db.prepare('INSERT INTO project_events (project_id,kind,detail,created_at) VALUES (?,?,?,?)').bind(projectId,'editor_comment',timeSeconds >= 0 ? 'Comentario del editor con marca de tiempo' : 'Nuevo mensaje del editor',now),
      db.prepare('UPDATE projects SET updated_at=? WHERE id=?').bind(now,projectId),
    ]);
    return json({ ok: true },201);
  } catch (error) {
    return json({ error: error.message || 'No se pudo enviar el mensaje.' },400);
  }
}
