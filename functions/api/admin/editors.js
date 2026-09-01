import { assertSameOrigin, hashPassword, normalizeEmail } from '../../lib/auth.js';
import { cleanText, ensureDatabase, json, makeId, nowIso } from '../../lib/db.js';

export async function onRequestGet({ env }) {
  const db = await ensureDatabase(env);
  const result = await db.prepare(`SELECT e.id,e.name,e.alias,e.email,e.status,e.must_change_password,e.last_login_at,e.created_at,e.updated_at,
    (SELECT COUNT(*) FROM projects p WHERE p.editor_id=e.id AND p.status!='archived') AS project_count
    FROM editors e ORDER BY e.status='active' DESC,e.created_at DESC`).all();
  return json({ editors: result.results || [] });
}

export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    const body = await request.json();
    const name = cleanText(body.name,180);
    const alias = cleanText(body.alias || 'Equipo de edición',80);
    const email = normalizeEmail(body.email);
    if (!name || !email || !email.includes('@')) return json({ error: 'Nombre y correo válidos son requeridos.' },400);
    const credentials = await hashPassword(String(body.password || ''));
    const now = nowIso();
    const id = makeId('editor');
    const db = await ensureDatabase(env);
    await db.prepare(`INSERT INTO editors
      (id,name,alias,email,password_hash,password_salt,status,must_change_password,last_login_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'active',1,'',?,?)`)
      .bind(id,name,alias,email,credentials.hash,credentials.salt,now,now).run();
    return json({ ok: true,id },201);
  } catch (error) {
    const duplicate = /unique|idx_editors_email/i.test(String(error.message || ''));
    return json({ error: duplicate ? 'Ya existe un editor con ese correo.' : (error.message || 'No se pudo crear el editor.') },400);
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    assertSameOrigin(request);
    const body = await request.json();
    const id = cleanText(body.id,100);
    const name = cleanText(body.name,180);
    const alias = cleanText(body.alias || 'Equipo de edición',80);
    const email = normalizeEmail(body.email);
    const status = body.status === 'inactive' ? 'inactive' : 'active';
    if (!id || !name || !email || !email.includes('@')) return json({ error: 'Datos de editor no válidos.' },400);
    const db = await ensureDatabase(env);
    const existing = await db.prepare('SELECT id,email,status FROM editors WHERE id=?').bind(id).first();
    if (!existing) return json({ error: 'Editor no encontrado.' },404);
    const now = nowIso();
    const statements = [db.prepare('UPDATE editors SET name=?,alias=?,email=?,status=?,updated_at=? WHERE id=?').bind(name,alias,email,status,now,id)];
    if (body.password) {
      const credentials = await hashPassword(String(body.password));
      statements.push(db.prepare('UPDATE editors SET password_hash=?,password_salt=?,must_change_password=1,updated_at=? WHERE id=?').bind(credentials.hash,credentials.salt,now,id));
      statements.push(db.prepare('DELETE FROM editor_sessions WHERE editor_id=?').bind(id));
    }
    if (!body.password && (status !== existing.status || email !== existing.email)) {
      statements.push(db.prepare('DELETE FROM editor_sessions WHERE editor_id=?').bind(id));
    }
    await db.batch(statements);
    return json({ ok: true });
  } catch (error) {
    const duplicate = /unique|idx_editors_email/i.test(String(error.message || ''));
    return json({ error: duplicate ? 'Ya existe un editor con ese correo.' : (error.message || 'No se pudo actualizar el editor.') },400);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    assertSameOrigin(request);
    const id = cleanText((await request.json()).id,100);
    if (!id) return json({ error: 'Editor no válido.' },400);
    const db = await ensureDatabase(env);
    const projects = await db.prepare('SELECT COUNT(*) AS value FROM projects WHERE editor_id=?').bind(id).first();
    if (Number(projects?.value || 0) > 0) return json({ error: 'Reasigna sus proyectos antes de eliminar este acceso. Puedes desactivarlo ahora.' },409);
    await db.batch([
      db.prepare('DELETE FROM editor_sessions WHERE editor_id=?').bind(id),
      db.prepare('DELETE FROM editor_login_attempts WHERE email IN (SELECT email FROM editors WHERE id=?)').bind(id),
      db.prepare('DELETE FROM editors WHERE id=?').bind(id),
    ]);
    return json({ ok: true });
  } catch (error) {
    return json({ error: error.message || 'No se pudo eliminar el editor.' },400);
  }
}
