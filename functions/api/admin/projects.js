import { cleanText, ensureDatabase, json, makeId, nowIso } from '../../lib/db.js';

const statuses = new Set(['briefing','editing','review','approved','delivered','archived']);
const paymentStatuses = new Set(['not_required','pending','paid']);
const currencies = new Set(['USD','EUR','GBP','CAD']);

function normalize(body) {
  const clientId = cleanText(body.client_id, 100);
  const title = cleanText(body.title, 240);
  const status = statuses.has(body.status) ? body.status : 'briefing';
  const progress = Math.max(0, Math.min(100, Math.trunc(Number(body.progress) || 0)));
  const paymentAmountCents = Math.max(0, Math.min(100000000, Math.round(Number(body.payment_amount || 0) * 100)));
  const paymentStatus = paymentStatuses.has(body.payment_status) ? body.payment_status : (paymentAmountCents ? 'pending' : 'not_required');
  const paymentCurrency = currencies.has(body.payment_currency) ? body.payment_currency : 'USD';
  if (!clientId || !title) throw new Error('Cliente y título son requeridos.');
  return {
    clientId, title, status, progress,
    service: cleanText(body.service || 'Edición de video', 180),
    dueDate: cleanText(body.due_date, 20),
    description: cleanText(body.description, 5000),
    paymentAmountCents, paymentStatus, paymentCurrency,
  };
}

export async function onRequestGet({ env }) {
  const db = await ensureDatabase(env);
  const result = await db.prepare(`SELECT p.*,c.name AS client_name,c.email AS client_email,
    (SELECT COUNT(*) FROM project_versions v WHERE v.project_id=p.id) AS version_count,
    (SELECT COUNT(*) FROM project_versions v WHERE v.project_id=p.id AND v.status='review') AS pending_reviews
    FROM projects p JOIN clients c ON c.id=p.client_id ORDER BY p.updated_at DESC`).all();
  return json({ projects: result.results || [] });
}

export async function onRequestPost({ request, env }) {
  try {
    const item = normalize(await request.json());
    const db = await ensureDatabase(env);
    const client = await db.prepare('SELECT id FROM clients WHERE id=?').bind(item.clientId).first();
    if (!client) return json({ error: 'Cliente no encontrado.' }, 404);
    const id = makeId('project');
    const now = nowIso();
    await db.batch([
      db.prepare(`INSERT INTO projects
        (id,client_id,title,service,status,progress,due_date,description,payment_amount_cents,payment_currency,payment_status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,item.clientId,item.title,item.service,item.status,item.progress,item.dueDate,item.description,item.paymentAmountCents,item.paymentCurrency,item.paymentStatus,now,now),
      db.prepare('INSERT INTO project_events (project_id,kind,detail,created_at) VALUES (?,?,?,?)')
        .bind(id,'project_created','Proyecto creado',now),
    ]);
    return json({ ok: true, id }, 201);
  } catch (error) {
    return json({ error: error.message || 'No se pudo crear el proyecto.' }, 400);
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    const body = await request.json();
    const id = cleanText(body.id, 100);
    const item = normalize(body);
    if (!id) return json({ error: 'Proyecto no válido.' }, 400);
    const db = await ensureDatabase(env);
    const now = nowIso();
    const result = await db.prepare(`UPDATE projects SET client_id=?,title=?,service=?,status=?,progress=?,due_date=?,description=?,payment_amount_cents=?,payment_currency=?,payment_status=?,updated_at=? WHERE id=?`)
      .bind(item.clientId,item.title,item.service,item.status,item.progress,item.dueDate,item.description,item.paymentAmountCents,item.paymentCurrency,item.paymentStatus,now,id).run();
    if (!result.meta?.changes) return json({ error: 'Proyecto no encontrado.' }, 404);
    await db.prepare('INSERT INTO project_events (project_id,kind,detail,created_at) VALUES (?,?,?,?)')
      .bind(id,'project_updated',`Estado: ${item.status} · ${item.progress}%`,now).run();
    return json({ ok: true });
  } catch (error) {
    return json({ error: error.message || 'No se pudo actualizar el proyecto.' }, 400);
  }
}
