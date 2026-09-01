import { assertSameOrigin } from '../../lib/auth.js';
import { cleanText, ensureDatabase, json, nowIso } from '../../lib/db.js';
import { redactExternalContacts } from '../../lib/project-message.js';

export async function onRequestGet({ env, data }) {
  const db = await ensureDatabase(env);
  const result = await db.prepare(`SELECT n.id,n.project_id,n.kind,n.title,n.body,n.read_at,n.created_at,
    c.name AS private_client_name,c.email AS private_client_email
    FROM project_notifications n LEFT JOIN projects p ON p.id=n.project_id LEFT JOIN clients c ON c.id=p.client_id
    WHERE n.recipient_role='editor' AND n.recipient_id=? ORDER BY n.created_at DESC LIMIT 80`).bind(data.editor.id).all();
  return json({ notifications: (result.results || []).map((notice) => {
    const privateValues=[notice.private_client_name,notice.private_client_email];
    return { id:notice.id,project_id:notice.project_id,kind:notice.kind,
      title:redactExternalContacts(notice.title,privateValues),body:redactExternalContacts(notice.body,privateValues),
      read_at:notice.read_at,created_at:notice.created_at };
  }) });
}

export async function onRequestPatch({ request, env, data }) {
  try {
    assertSameOrigin(request);
    const body = await request.json();
    const id = cleanText(body.id,100);
    const db = await ensureDatabase(env);
    if (id) await db.prepare(`UPDATE project_notifications SET read_at=? WHERE id=? AND recipient_role='editor' AND recipient_id=?`).bind(nowIso(),id,data.editor.id).run();
    else await db.prepare(`UPDATE project_notifications SET read_at=? WHERE recipient_role='editor' AND recipient_id=? AND read_at=''`).bind(nowIso(),data.editor.id).run();
    return json({ ok: true });
  } catch (error) {
    return json({ error: error.message || 'No se pudo actualizar la notificación.' },400);
  }
}
