import { cleanText, ensureDatabase, json, makeId, nowIso } from '../../lib/db.js';
import { assertSameOrigin, requireClient } from '../../lib/auth.js';

function publicMessage(item) {
  return {
    id: item.id,
    sender_role: item.sender_role,
    author_name: item.sender_role === 'client' ? 'Tú' : cleanText(item.author_label, 80) || 'Digital Forge',
    message: item.message,
    read_at: item.read_at,
    created_at: item.created_at,
  };
}

export async function onRequestGet(context) {
  const auth = await requireClient(context);
  if (auth.response) return auth.response;
  try {
    const db = await ensureDatabase(context.env);
    const result = await db.prepare(`SELECT id,sender_role,author_label,message,read_at,created_at
      FROM client_support_messages WHERE client_id=? ORDER BY created_at ASC LIMIT 500`)
      .bind(auth.client.id).all();
    const unread = (result.results || []).filter((item) => item.sender_role === 'admin' && !item.read_at).map((item) => item.id);
    if (unread.length) {
      await db.prepare(`UPDATE client_support_messages SET read_at=?
        WHERE client_id=? AND sender_role='admin' AND read_at=''`).bind(nowIso(), auth.client.id).run();
    }
    return json({ messages: (result.results || []).map(publicMessage) });
  } catch (error) {
    return json({ error: error.message || 'No se pudo abrir la asesoría.' }, 400);
  }
}

export async function onRequestPost(context) {
  const auth = await requireClient(context);
  if (auth.response) return auth.response;
  try {
    assertSameOrigin(context.request);
    const body = await context.request.json();
    const message = cleanText(body.message, 1800);
    if (!message) return json({ error: 'Escribe tu consulta o idea.' }, 400);
    const db = await ensureDatabase(context.env);
    const createdAt = nowIso();
    const id = makeId('support');
    await db.prepare(`INSERT INTO client_support_messages
      (id,client_id,sender_role,sender_id,author_label,message,read_at,created_at)
      VALUES (?,?,'client',?,?,?,'',?)`)
      .bind(id, auth.client.id, auth.client.id, auth.client.name, message, createdAt).run();
    return json({ message: publicMessage({ id, sender_role: 'client', author_label: auth.client.name, message, read_at: '', created_at: createdAt }) }, 201);
  } catch (error) {
    return json({ error: error.message || 'No se pudo enviar el mensaje.' }, 400);
  }
}
