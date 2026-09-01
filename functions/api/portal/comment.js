import { cleanText, ensureDatabase, json, nowIso } from '../../lib/db.js';
import { assertSameOrigin, requireClient } from '../../lib/auth.js';
import { messageInsert, moderateProjectMessage, notificationInsert, protectClientIdentity } from '../../lib/project-message.js';

export async function onRequestPost(context) {
  const auth = await requireClient(context);
  if (auth.response) return auth.response;
  try {
    assertSameOrigin(context.request);
    const body = await context.request.json();
    const projectId = cleanText(body.project_id, 100);
    const versionId = cleanText(body.version_id, 100);
    const message = protectClientIdentity(moderateProjectMessage(body.message),auth.client);
    const hasTime = body.time_seconds !== undefined && body.time_seconds !== null && body.time_seconds !== '';
    const rawTime = Number(body.time_seconds);
    const timeSeconds = versionId && hasTime && Number.isFinite(rawTime) ? Math.max(0, Math.min(Math.floor(rawTime), 86400)) : -1;
    if (!message) return json({ error: 'Escribe un comentario.' }, 400);
    const db = await ensureDatabase(context.env);
    const project = await db.prepare('SELECT id,editor_id,public_code FROM projects WHERE id=? AND client_id=?').bind(projectId, auth.client.id).first();
    if (!project) return json({ error: 'Proyecto no encontrado.' }, 404);
    if (versionId) {
      const version = await db.prepare('SELECT id FROM project_versions WHERE id=? AND project_id=?').bind(versionId, projectId).first();
      if (!version) return json({ error: 'Versión no encontrada.' }, 404);
    }
    const now = nowIso();
    const statements = [
      messageInsert(db,{ projectId,versionId,senderRole:'client',senderId:auth.client.id,authorLabel:auth.client.name,message,timeSeconds }),
      db.prepare('INSERT INTO project_events (project_id,kind,detail,created_at) VALUES (?,?,?,?)')
        .bind(projectId,'client_comment',timeSeconds >= 0 ? `Nuevo comentario del cliente en ${Math.floor(timeSeconds / 60)}:${String(timeSeconds % 60).padStart(2, '0')}` : 'Nuevo comentario del cliente',now),
      db.prepare('UPDATE projects SET updated_at=? WHERE id=?').bind(now,projectId),
    ];
    if (project.editor_id) statements.push(notificationInsert(db,{ recipientRole:'editor',recipientId:project.editor_id,projectId,kind:'client_message',title:'Nueva indicación del cliente',body:project.public_code || 'Revisa el chat del proyecto.' }));
    await db.batch(statements);
    return json({ ok: true }, 201);
  } catch (error) {
    return json({ error: error.message || 'No se pudo guardar el comentario.' }, 400);
  }
}
