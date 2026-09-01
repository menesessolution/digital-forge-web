import { assertSameOrigin, burnPasswordCheck, hashIp, normalizeEmail, verifyPassword } from '../../../lib/auth.js';
import { createEditorSession } from '../../../lib/editor-auth.js';
import { ensureDatabase, json, nowIso } from '../../../lib/db.js';

export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    const body = await request.json();
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    if (!email || !password) return json({ error: 'Correo y contraseña requeridos.' }, 400);
    const db = await ensureDatabase(env);
    const ipHash = await hashIp(request);
    const now = Math.floor(Date.now() / 1000);
    const recent = await db.prepare(`SELECT COUNT(*) AS value FROM editor_login_attempts
      WHERE email=? AND ip_hash=? AND success=0 AND created_at>?`).bind(email,ipHash,now - 900).first();
    if (Number(recent?.value || 0) >= 8) return json({ error: 'Demasiados intentos. Espera 15 minutos.' }, 429);
    const editor = await db.prepare('SELECT * FROM editors WHERE email=?').bind(email).first();
    const valid = editor ? await verifyPassword(password,editor.password_hash,editor.password_salt) : (await burnPasswordCheck(password),false);
    await db.batch([
      db.prepare('INSERT INTO editor_login_attempts (email,ip_hash,success,created_at) VALUES (?,?,?,?)').bind(email,ipHash,valid ? 1 : 0,now),
      db.prepare('DELETE FROM editor_login_attempts WHERE created_at<?').bind(now - 86400),
    ]);
    if (!valid || editor.status !== 'active') return json({ error: 'Correo o contraseña incorrectos.' }, 401);
    const timestamp = nowIso();
    await db.prepare('UPDATE editors SET last_login_at=?,updated_at=? WHERE id=?').bind(timestamp,timestamp,editor.id).run();
    const cookie = await createEditorSession(env,editor.id);
    return json({ ok: true, editor: { name: editor.name, alias: editor.alias, must_change_password: Boolean(editor.must_change_password) } },200,{ 'set-cookie': cookie });
  } catch (error) {
    return json({ error: error.message || 'No se pudo iniciar sesión.' }, 400);
  }
}
