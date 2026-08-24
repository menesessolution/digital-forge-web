import { cleanText, ensureDatabase, json, makeId, nowIso } from '../../lib/db.js';
import { hashPassword, normalizeEmail } from '../../lib/auth.js';

export async function onRequestGet({ env }) {
  const db = await ensureDatabase(env);
  const result = await db.prepare(`SELECT c.id,c.name,c.email,c.locale,c.status,c.last_login_at,c.created_at,c.updated_at,
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
    if (!name || !email || !email.includes('@')) return json({ error: 'Nombre y correo válidos son requeridos.' }, 400);
    const credentials = await hashPassword(String(body.password || ''));
    const db = await ensureDatabase(env);
    const id = makeId('client');
    const now = nowIso();
    await db.prepare(`INSERT INTO clients
      (id,name,email,password_hash,password_salt,locale,status,last_login_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'active','',?,?)`)
      .bind(id,name,email,credentials.hash,credentials.salt,locale,now,now).run();
    return json({ ok: true, id }, 201);
  } catch (error) {
    const duplicate = String(error.message || '').includes('UNIQUE');
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
      statements.push(db.prepare('DELETE FROM client_sessions WHERE client_id=?').bind(id));
    }
    await db.batch(statements);
    return json({ ok: true });
  } catch (error) {
    const duplicate = String(error.message || '').includes('UNIQUE');
    return json({ error: duplicate ? 'Ya existe un cliente con ese correo.' : (error.message || 'No se pudo actualizar el cliente.') }, 400);
  }
}
