import { cleanText, ensureDatabase, json, makeId, nowIso } from '../../lib/db.js';
import { assertSameOrigin } from '../../lib/auth.js';
import { notificationInsert } from '../../lib/project-message.js';

export async function onRequestGet({ request, env }) {
  try {
    const db = await ensureDatabase(env);
    const clientId = cleanText(new URL(request.url).searchParams.get('client_id'), 100);
    if (!clientId) {
      const result = await db.prepare(`SELECT c.id,c.name,c.email,
          (SELECT message FROM client_support_messages sm WHERE sm.client_id=c.id ORDER BY sm.created_at DESC LIMIT 1) AS last_message,
          (SELECT created_at FROM client_support_messages sm WHERE sm.client_id=c.id ORDER BY sm.created_at DESC LIMIT 1) AS last_at,
          (SELECT COUNT(*) FROM client_support_messages sm WHERE sm.client_id=c.id AND sm.sender_role='client' AND sm.read_at='') AS unread_count
        FROM clients c WHERE EXISTS (SELECT 1 FROM client_support_messages sm WHERE sm.client_id=c.id)
        ORDER BY last_at DESC`).all();
      return json({ threads: result.results || [] });
    }
    const client = await db.prepare('SELECT id,name,email,status FROM clients WHERE id=?').bind(clientId).first();
    if (!client) return json({ error: 'Cliente no encontrado.' }, 404);
    const result = await db.prepare(`SELECT id,sender_role,author_label,message,read_at,created_at
      FROM client_support_messages WHERE client_id=? ORDER BY created_at ASC LIMIT 500`).bind(clientId).all();
    await db.prepare(`UPDATE client_support_messages SET read_at=?
      WHERE client_id=? AND sender_role='client' AND read_at=''`).bind(nowIso(), clientId).run();
    return json({ client, messages: result.results || [] });
  } catch (error) {
    return json({ error: error.message || 'No se pudo abrir la conversación.' }, 400);
  }
}

export async function onRequestPost({ request, env, data }) {
  try {
    assertSameOrigin(request);
    const body = await request.json();
    const clientId = cleanText(body.client_id, 100);
    const message = cleanText(body.message, 1800);
    if (!clientId || !message) return json({ error: 'Cliente y mensaje son requeridos.' }, 400);
    const db = await ensureDatabase(env);
    const client = await db.prepare('SELECT id FROM clients WHERE id=?').bind(clientId).first();
    if (!client) return json({ error: 'Cliente no encontrado.' }, 404);
    const createdAt = nowIso();
    const id = makeId('support');
    await db.batch([
      db.prepare(`INSERT INTO client_support_messages
        (id,client_id,sender_role,sender_id,author_label,message,read_at,created_at)
        VALUES (?,?,'admin',?,?,?,'',?)`)
        .bind(id, clientId, data.admin.id, data.admin.name || 'Digital Forge', message, createdAt),
      notificationInsert(db,{ recipientRole:'client',recipientId:clientId,kind:'support_reply',title:'Digital Forge respondió tu consulta',body:'Abre Ideas y asesoría para continuar la conversación.' }),
    ]);
    return json({ message: { id, sender_role:'admin', author_label:data.admin.name || 'Digital Forge', message, read_at:'', created_at:createdAt } }, 201);
  } catch (error) {
    return json({ error: error.message || 'No se pudo enviar el mensaje.' }, 400);
  }
}
