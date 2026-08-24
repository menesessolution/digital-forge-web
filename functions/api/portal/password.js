import { cleanText, ensureDatabase, json, nowIso } from '../../lib/db.js';
import { assertSameOrigin, createSession, hashPassword, requireClient, verifyPassword } from '../../lib/auth.js';

export async function onRequestPost(context) {
  try {
    assertSameOrigin(context.request);
    const auth = await requireClient(context);
    if (auth.response) return auth.response;
    const body = await context.request.json();
    const currentPassword = String(body.current_password || '');
    const newPassword = String(body.new_password || '');
    const confirmation = String(body.confirm_password || '');
    if (!currentPassword || !newPassword || !confirmation) return json({ error: 'Completa los tres campos.' }, 400);
    if (newPassword !== confirmation) return json({ error: 'Las contraseñas nuevas no coinciden.' }, 400);
    if (newPassword === currentPassword) return json({ error: 'La nueva contraseña debe ser diferente a la temporal.' }, 400);
    const db = await ensureDatabase(context.env);
    const client = await db.prepare('SELECT id,password_hash,password_salt FROM clients WHERE id=?').bind(auth.client.id).first();
    if (!client || !(await verifyPassword(currentPassword, client.password_hash, client.password_salt))) {
      return json({ error: 'La contraseña actual no es correcta.' }, 400);
    }
    const credentials = await hashPassword(newPassword);
    await db.batch([
      db.prepare('UPDATE clients SET password_hash=?,password_salt=?,must_change_password=0,updated_at=? WHERE id=?')
        .bind(credentials.hash,credentials.salt,nowIso(),client.id),
      db.prepare('DELETE FROM client_sessions WHERE client_id=?').bind(client.id),
    ]);
    const session = await createSession(context.env, client.id);
    return json({ ok: true }, 200, { 'set-cookie': session.cookie });
  } catch (error) {
    return json({ error: cleanText(error.message || 'No se pudo cambiar la contraseña.', 300) }, 400);
  }
}
