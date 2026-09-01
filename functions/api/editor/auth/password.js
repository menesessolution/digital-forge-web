import { assertSameOrigin, hashPassword, verifyPassword } from '../../../lib/auth.js';
import { createEditorSession, requireEditor } from '../../../lib/editor-auth.js';
import { ensureDatabase, json, nowIso } from '../../../lib/db.js';

export async function onRequestPost(context) {
  try {
    assertSameOrigin(context.request);
    const auth = await requireEditor(context);
    if (auth.response) return auth.response;
    const body = await context.request.json();
    const current = String(body.current_password || '');
    const next = String(body.new_password || '');
    if (!current || !next || next !== String(body.confirm_password || '')) return json({ error: 'Completa los campos y confirma la nueva contraseña.' },400);
    if (current === next) return json({ error: 'La nueva contraseña debe ser diferente.' },400);
    const db = await ensureDatabase(context.env);
    const editor = await db.prepare('SELECT id,password_hash,password_salt FROM editors WHERE id=?').bind(auth.editor.id).first();
    if (!editor || !(await verifyPassword(current,editor.password_hash,editor.password_salt))) return json({ error: 'La contraseña actual no es correcta.' },400);
    const credentials = await hashPassword(next);
    await db.batch([
      db.prepare('UPDATE editors SET password_hash=?,password_salt=?,must_change_password=0,updated_at=? WHERE id=?').bind(credentials.hash,credentials.salt,nowIso(),editor.id),
      db.prepare('DELETE FROM editor_sessions WHERE editor_id=?').bind(editor.id),
    ]);
    return json({ ok: true },200,{ 'set-cookie': await createEditorSession(context.env,editor.id) });
  } catch (error) {
    return json({ error: error.message || 'No se pudo cambiar la contraseña.' },400);
  }
}
