import { assertSameOrigin, burnPasswordCheck, hashIp, normalizeEmail, verifyPassword } from '../../../lib/auth.js';
import { createAdminSession } from '../../../lib/admin-auth.js';
import { ensureDatabase, json, nowIso } from '../../../lib/db.js';

export async function onRequestPost({ env, request }) {
  try {
    assertSameOrigin(request);
    const body = await request.json();
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    if (!email || !password) return json({ error: 'Correo y contraseña requeridos.' }, 400);
    const db = await ensureDatabase(env);
    const ipHash = await hashIp(request);
    const now = Math.floor(Date.now() / 1000);
    const recent = await db.prepare(`SELECT COUNT(*) AS value FROM admin_login_attempts
      WHERE email=? AND ip_hash=? AND created_at>?`).bind(email, ipHash, now - 900).first();
    if (Number(recent?.value || 0) >= 8) return json({ error: 'Demasiados intentos. Espera 15 minutos.' }, 429);
    const admin = await db.prepare('SELECT * FROM admin_users WHERE email=? AND status=\'active\'').bind(email).first();
    const valid = admin ? await verifyPassword(password, admin.password_hash, admin.password_salt) : (await burnPasswordCheck(password), false);
    await db.batch([
      db.prepare('INSERT INTO admin_login_attempts (email,ip_hash,success,created_at) VALUES (?,?,?,?)').bind(email, ipHash, valid ? 1 : 0, now),
      db.prepare('DELETE FROM admin_login_attempts WHERE created_at<?').bind(now - 86400),
    ]);
    if (!valid) return json({ error: 'Correo o contraseña incorrectos.' }, 401);
    const timestamp = nowIso();
    await db.prepare('UPDATE admin_users SET last_login_at=?,updated_at=? WHERE id=?').bind(timestamp, timestamp, admin.id).run();
    const cookie = await createAdminSession(env, admin.id);
    return json({ ok: true, admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } }, 200, { 'set-cookie': cookie });
  } catch (error) {
    return json({ error: error.message || 'No se pudo iniciar sesión.' }, 400);
  }
}
