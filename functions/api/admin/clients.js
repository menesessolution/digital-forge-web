import { cleanText, ensureDatabase, json, makeId, nowIso } from '../../lib/db.js';
import { hashPassword, normalizeEmail } from '../../lib/auth.js';

export async function onRequestGet({ env }) {
  const db = await ensureDatabase(env);
  const result = await db.prepare(`SELECT c.id,c.name,c.email,c.locale,c.status,c.must_change_password,c.last_login_at,c.created_at,c.updated_at,
    (SELECT COUNT(*) FROM projects p WHERE p.client_id=c.id AND p.status!='archived') AS project_count
    FROM clients c ORDER BY c.created_at DESC`).all();
  return json({ clients: result.results || [] });
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const name = cleanText(body.name, 180);
    const email = normalizeEmail(body.email);
    const locale = body.locale === 'en' ? 'en' : 'es';
    const status = body.status === 'inactive' ? 'inactive' : 'active';
    if (!name || !email || !email.includes('@')) return json({ error: 'Nombre y correo válidos son requeridos.' }, 400);
    const credentials = await hashPassword(String(body.password || ''));
    const db = await ensureDatabase(env);
    const id = makeId('client');
    const now = nowIso();
    await db.prepare(`INSERT INTO clients
      (id,name,email,password_hash,password_salt,locale,status,last_login_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'',?,?)`)
      .bind(id,name,email,credentials.hash,credentials.salt,locale,status,now,now).run();
    return json({ ok: true, id }, 201);
  } catch (error) {
    const duplicate = /unique|idx_clients_email/i.test(String(error.message || ''));
    return json({ error: duplicate ? 'Ya existe un cliente con ese correo.' : (error.message || 'No se pudo crear el cliente.') }, 400);
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    const body = await request.json();
    const id = cleanText(body.id, 100);
    const name = cleanText(body.name, 180);
    const email = normalizeEmail(body.email);
    const locale = body.locale === 'en' ? 'en' : 'es';
    const status = body.status === 'inactive' ? 'inactive' : 'active';
    if (!id || !name || !email || !email.includes('@')) return json({ error: 'Datos de cliente no válidos.' }, 400);
    const db = await ensureDatabase(env);
    const now = nowIso();
    const statements = [db.prepare('UPDATE clients SET name=?,email=?,locale=?,status=?,updated_at=? WHERE id=?')
      .bind(name,email,locale,status,now,id)];
    if (body.password) {
      const credentials = await hashPassword(String(body.password));
      statements.push(db.prepare('UPDATE clients SET password_hash=?,password_salt=?,updated_at=? WHERE id=?')
        .bind(credentials.hash,credentials.salt,now,id));
      statements.push(db.prepare('UPDATE clients SET must_change_password=1 WHERE id=?').bind(id));
      statements.push(db.prepare('DELETE FROM client_sessions WHERE client_id=?').bind(id));
    }
    await db.batch(statements);
    return json({ ok: true });
  } catch (error) {
    const duplicate = /unique|idx_clients_email/i.test(String(error.message || ''));
    return json({ error: duplicate ? 'Ya existe un cliente con ese correo.' : (error.message || 'No se pudo actualizar el cliente.') }, 400);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const body = await request.json();
    const id = cleanText(body.id, 100);
    if (!id) return json({ error: 'Selecciona el cliente que deseas eliminar.' }, 400);
    const db = await ensureDatabase(env);
    const client = await db.prepare('SELECT id,name,email FROM clients WHERE id=?').bind(id).first();
    if (!client) return json({ error: 'Cliente no encontrado.' }, 404);
    const storedFiles = await db.prepare(`SELECT v.r2_key FROM project_versions v
      JOIN projects p ON p.id=v.project_id WHERE p.client_id=? AND v.r2_key!=''`).bind(id).all();
    const keys = (storedFiles.results || []).map((item) => item.r2_key).filter(Boolean);
    if (env.FILES && keys.length) await Promise.all(keys.map((key) => env.FILES.delete(key)));
    await db.batch([
      db.prepare('DELETE FROM project_comments WHERE client_id=? OR project_id IN (SELECT id FROM projects WHERE client_id=?)').bind(id,id),
      db.prepare('DELETE FROM project_events WHERE project_id IN (SELECT id FROM projects WHERE client_id=?)').bind(id),
      db.prepare('DELETE FROM project_versions WHERE project_id IN (SELECT id FROM projects WHERE client_id=?)').bind(id),
      db.prepare('DELETE FROM projects WHERE client_id=?').bind(id),
      db.prepare('DELETE FROM client_sessions WHERE client_id=?').bind(id),
      db.prepare('DELETE FROM login_attempts WHERE email=?').bind(client.email),
      db.prepare('DELETE FROM clients WHERE id=?').bind(id),
    ]);
    return json({ ok: true, deleted: { id: client.id, name: client.name } });
  } catch (error) {
    return json({ error: error.message || 'No se pudo eliminar el cliente.' }, 400);
  }
}
