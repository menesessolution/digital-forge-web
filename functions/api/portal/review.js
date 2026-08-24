import { cleanText, ensureDatabase, json, makeId, nowIso } from '../../lib/db.js';
import { assertSameOrigin, requireClient } from '../../lib/auth.js';

export async function onRequestPost(context) {
  const auth = await requireClient(context);
  if (auth.response) return auth.response;
  try {
    assertSameOrigin(context.request);
    const body = await context.request.json();
    const versionId = cleanText(body.version_id, 100);
    const decision = cleanText(body.decision, 30);
    const message = cleanText(body.message, 3000);
    if (!['approved','changes_requested'].includes(decision)) return json({ error: 'Decisión no válida.' }, 400);
    if (decision === 'changes_requested' && !message) return json({ error: 'Describe los cambios que necesitas.' }, 400);
    const db = await ensureDatabase(context.env);
    const version = await db.prepare(`SELECT v.*,p.client_id FROM project_versions v
      JOIN projects p ON p.id=v.project_id WHERE v.id=? AND p.client_id=?`).bind(versionId, auth.client.id).first();
    if (!version) return json({ error: 'Versión no encontrada.' }, 404);
    if (!['review','changes_requested'].includes(version.status)) return json({ error: 'Esta versión ya fue cerrada.' }, 409);
    const now = nowIso();
    const statements = [
      db.prepare('UPDATE project_versions SET status=?,updated_at=? WHERE id=?').bind(decision, now, versionId),
      db.prepare('UPDATE projects SET status=?,progress=?,updated_at=? WHERE id=?')
        .bind(decision === 'approved' ? 'approved' : 'editing', decision === 'approved' ? 90 : 70, now, version.project_id),
      db.prepare('INSERT INTO project_events (project_id,kind,detail,created_at) VALUES (?,?,?,?)')
        .bind(version.project_id, decision, decision === 'approved' ? `Versión ${version.version_number} aprobada` : `Cambios solicitados en versión ${version.version_number}`, now),
    ];
    if (message) statements.push(db.prepare(`INSERT INTO project_comments
      (id,project_id,version_id,client_id,author_role,author_name,message,created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .bind(makeId('comment'),version.project_id,versionId,auth.client.id,'client',auth.client.name,message,now));
    await db.batch(statements);
    return json({ ok: true });
  } catch (error) {
    return json({ error: error.message || 'No se pudo guardar la revisión.' }, 400);
  }
}
