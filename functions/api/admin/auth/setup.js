import { assertSameOrigin, hashPassword, normalizeEmail } from '../../../lib/auth.js';
import { createAdminSession, secretMatches } from '../../../lib/admin-auth.js';
import { cleanText, ensureDatabase, json, makeId, nowIso } from '../../../lib/db.js';

export async function onRequestPost({ env, request }) {
  try {
    assertSameOrigin(request);
    const db = await ensureDatabase(env);
    const existing = await db.prepare('SELECT COUNT(*) AS value FROM admin_users').first();
    if (Number(existing?.value || 0) > 0) return json({ error: 'Las cuentas privadas ya fueron activadas.' }, 409);

    const body = await request.json();
    if (!(await secretMatches(String(body.bootstrap_token || ''), env.ADMIN_TOKEN))) {
      return json({ error: 'La clave administrativa anterior no es válida.' }, 401);
    }
    const accounts = Array.isArray(body.accounts) ? body.accounts.slice(0, 2) : [];
    if (accounts.length !== 2) return json({ error: 'Debes crear exactamente dos cuentas.' }, 400);
    const normalized = accounts.map((account, index) => ({
      id: makeId('admin'),
      name: cleanText(account.name, 120),
      email: normalizeEmail(account.email),
      password: String(account.password || ''),
      role: index === 0 ? 'owner' : 'operations',
    }));
    if (normalized.some((account) => !account.name || !account.email)) return json({ error: 'Completa los nombres y correos.' }, 400);
    if (new Set(normalized.map((account) => account.email)).size !== 2) return json({ error: 'Usa un correo diferente para cada cuenta.' }, 400);
    if (normalized[0].password === normalized[1].password) return json({ error: 'Cada persona debe usar una contraseña diferente.' }, 400);
    const credentials = await Promise.all(normalized.map((account) => hashPassword(account.password)));
    const now = nowIso();
    await db.batch(normalized.map((account, index) => db.prepare(`INSERT INTO admin_users
      (id,name,email,role,password_hash,password_salt,status,last_login_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'active','',?,?)`)
      .bind(account.id, account.name, account.email, account.role, credentials[index].hash, credentials[index].salt, now, now)));
    const cookie = await createAdminSession(env, normalized[0].id);
    return json({ ok: true, admin: { id: normalized[0].id, name: normalized[0].name, email: normalized[0].email, role: normalized[0].role } }, 201, { 'set-cookie': cookie });
  } catch (error) {
    return json({ error: error.message || 'No se pudieron activar las cuentas.' }, 400);
  }
}
