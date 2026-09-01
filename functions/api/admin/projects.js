import { cleanText, ensureDatabase, json, makeId, nowIso } from '../../lib/db.js';
import { assertSameOrigin } from '../../lib/auth.js';
import { moderateProjectMessage, notificationInsert } from '../../lib/project-message.js';

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
  const requestedCode = cleanText(body.public_code, 40).toUpperCase();
  return {
    clientId, title, status, progress,
    editorId: cleanText(body.editor_id, 100),
    publicCode: /^DF-\d{4}-[A-F0-9]{6}$/.test(requestedCode) ? requestedCode : '',
    editorTitle: cleanText(body.editor_title, 180),
    editorBrief: cleanText(body.editor_brief, 3000),
    service: cleanText(body.service || 'Edición de video', 180),
    dueDate: cleanText(body.due_date, 20),
    description: cleanText(body.description, 5000),
    paymentAmountCents, paymentStatus, paymentCurrency,
  };
}

function makePublicCode() {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return `DF-${new Date().getUTCFullYear()}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2,'0')).join('').toUpperCase()}`;
}

async function validateEditor(db, editorId) {
  if (!editorId) return null;
  return db.prepare("SELECT id FROM editors WHERE id=? AND status='active'").bind(editorId).first();
}

function privacyText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}

function validateEditorFacingContent(item, client) {
  for (const value of [item.publicCode,item.service,item.editorTitle,item.editorBrief]) if (value) moderateProjectMessage(value);
  const clientName = privacyText(client?.name).trim();
  const combined = privacyText(`${item.publicCode} ${item.service} ${item.editorTitle} ${item.editorBrief}`);
  if (clientName.length >= 3 && combined.includes(clientName)) throw new Error('Un campo visible al editor contiene el nombre del cliente. Usa únicamente el código anónimo.');
  const emailTokens = privacyText(client?.email).split('@')[0].split(/[\s._+-]+/).filter((token) => token.length >= 3);
  if (emailTokens.some((token) => combined.includes(token))) throw new Error('Los campos visibles al editor no pueden contener datos derivados del correo del cliente.');
}

export async function onRequestGet({ env }) {
  const db = await ensureDatabase(env);
  const result = await db.prepare(`SELECT p.*,c.name AS client_name,c.email AS client_email,
    e.name AS editor_name,e.alias AS editor_alias,e.email AS editor_email,
    (SELECT COUNT(*) FROM project_versions v WHERE v.project_id=p.id) AS version_count,
    (SELECT COUNT(*) FROM project_versions v WHERE v.project_id=p.id AND v.status='review') AS pending_reviews
    FROM projects p JOIN clients c ON c.id=p.client_id LEFT JOIN editors e ON e.id=p.editor_id ORDER BY p.updated_at DESC`).all();
  return json({ projects: result.results || [] });
}

export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    const item = normalize(await request.json());
    const db = await ensureDatabase(env);
    const client = await db.prepare('SELECT id,name,email FROM clients WHERE id=?').bind(item.clientId).first();
    if (!client) return json({ error: 'Cliente no encontrado.' }, 404);
    validateEditorFacingContent(item,client);
    if (item.editorId && !(await validateEditor(db,item.editorId))) return json({ error: 'El editor seleccionado no está activo.' },404);
    const id = makeId('project');
    const publicCode = item.publicCode || makePublicCode();
    const editorTitle = item.editorTitle || `Proyecto ${publicCode}`;
    const now = nowIso();
    const statements = [
      db.prepare(`INSERT INTO projects
        (id,client_id,editor_id,public_code,editor_title,editor_brief,title,service,status,progress,due_date,description,payment_amount_cents,payment_currency,payment_status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,item.clientId,item.editorId,publicCode,editorTitle,item.editorBrief,item.title,item.service,item.status,item.progress,item.dueDate,item.description,item.paymentAmountCents,item.paymentCurrency,item.paymentStatus,now,now),
      db.prepare('INSERT INTO project_events (project_id,kind,detail,created_at) VALUES (?,?,?,?)')
        .bind(id,'project_created','Proyecto creado',now),
    ];
    if (item.editorId) statements.push(notificationInsert(db,{ recipientRole:'editor',recipientId:item.editorId,projectId:id,kind:'assignment',title:'Nuevo proyecto asignado',body:publicCode }));
    await db.batch(statements);
    return json({ ok: true, id }, 201);
  } catch (error) {
    return json({ error: error.message || 'No se pudo crear el proyecto.' }, 400);
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    assertSameOrigin(request);
    const body = await request.json();
    const id = cleanText(body.id, 100);
    const item = normalize(body);
    if (!id) return json({ error: 'Proyecto no válido.' }, 400);
    const db = await ensureDatabase(env);
    const client = await db.prepare('SELECT id,name,email FROM clients WHERE id=?').bind(item.clientId).first();
    if (!client) return json({ error: 'Cliente no encontrado.' },404);
    validateEditorFacingContent(item,client);
    const existing = await db.prepare('SELECT id,client_id,public_code,editor_id FROM projects WHERE id=?').bind(id).first();
    if (!existing) return json({ error: 'Proyecto no encontrado.' },404);
    if (existing.client_id !== item.clientId) return json({ error: 'No puedes cambiar el cliente de un proyecto existente. Crea un proyecto nuevo para proteger sus archivos y conversaciones.' },409);
    if (item.editorId && !(await validateEditor(db,item.editorId))) return json({ error: 'El editor seleccionado no está activo.' },404);
    const existingCode = /^DF-\d{4}-[A-F0-9]{6}$/.test(existing.public_code || '') ? existing.public_code : '';
    const publicCode = item.publicCode || existingCode || makePublicCode();
    const editorTitle = item.editorTitle || `Proyecto ${publicCode}`;
    const now = nowIso();
    const result = await db.prepare(`UPDATE projects SET client_id=?,editor_id=?,public_code=?,editor_title=?,editor_brief=?,title=?,service=?,status=?,progress=?,due_date=?,description=?,payment_amount_cents=?,payment_currency=?,payment_status=?,updated_at=? WHERE id=?`)
      .bind(item.clientId,item.editorId,publicCode,editorTitle,item.editorBrief,item.title,item.service,item.status,item.progress,item.dueDate,item.description,item.paymentAmountCents,item.paymentCurrency,item.paymentStatus,now,id).run();
    if (!result.meta?.changes) return json({ error: 'Proyecto no encontrado.' }, 404);
    await db.prepare('INSERT INTO project_events (project_id,kind,detail,created_at) VALUES (?,?,?,?)')
      .bind(id,'project_updated',`Estado: ${item.status} · ${item.progress}%`,now).run();
    if (item.editorId && item.editorId !== existing.editor_id) {
      await notificationInsert(db,{ recipientRole:'editor',recipientId:item.editorId,projectId:id,kind:'assignment',title:'Nuevo proyecto asignado',body:publicCode }).run();
    }
    if (existing.editor_id && existing.editor_id !== item.editorId) {
      await db.prepare("DELETE FROM project_notifications WHERE recipient_role='editor' AND recipient_id=? AND project_id=?")
        .bind(existing.editor_id,id).run();
    }
    return json({ ok: true });
  } catch (error) {
    return json({ error: error.message || 'No se pudo actualizar el proyecto.' }, 400);
  }
}
