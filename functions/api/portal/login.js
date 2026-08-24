import { cleanText, ensureDatabase, json, nowIso } from '../../lib/db.js';
import { assertSameOrigin, burnPasswordCheck, createSession, hashIp, normalizeEmail, verifyPassword } from '../../lib/auth.js';

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
    const recent = await db.prepare(`SELECT COUNT(*) AS value FROM login_attempts
      WHERE email=? AND ip_hash=? AND success=0 AND created_at>?`)
      .bind(email, ipHash, now - 900).first();
    if ((recent?.value || 0) >= 8) return json({ error: 'Demasiados intentos. Espera 15 minutos.' }, 429);
    const client = await db.prepare('SELECT * FROM clients WHERE email=?').bind(email).first();
    const valid = client ? await verifyPassword(password, client.password_hash, client.password_salt) : (await burnPasswordCheck(password), false);
    await db.batch([
      db.prepare('INSERT INTO login_attempts (email,ip_hash,success,created_at) VALUES (?,?,?,?)').bind(email, ipHash, valid ? 1 : 0, now),
      db.prepare('DELETE FROM login_attempts WHERE created_at<?').bind(now - 86400),
    ]);
    if (!valid || client.status !== 'active') return json({ error: 'Correo o contraseña incorrectos.' }, 401);
    const session = await createSession(env, client.id);
    await db.prepare('UPDATE clients SET last_login_at=?,updated_at=? WHERE id=?').bind(nowIso(), nowIso(), client.id).run();
    return json({ ok: true, client: { id: client.id, name: client.name, email: client.email, locale: client.locale, must_change_password: Boolean(client.must_change_password) } }, 200, { 'set-cookie': session.cookie });
  } catch (error) {
    return json({ error: error.message || 'No se pudo iniciar sesión.' }, 400);
  }
}
