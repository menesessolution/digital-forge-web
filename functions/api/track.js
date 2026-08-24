import { cleanText, ensureDatabase, json, nowIso } from '../lib/db.js';

export async function onRequestPost({ request, env }) {
  try {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: 'Forbidden' }, 403);
    const db = await ensureDatabase(env);
    const body = await request.json();
    const name = cleanText(body.name, 80);
    if (!name) return json({ error: 'Event name is required' }, 400);
    await db.prepare('INSERT INTO events (name,path,locale,meta,created_at) VALUES (?,?,?,?,?)')
      .bind(
        name,
        cleanText(body.path || '/', 300),
        body.locale === 'en' ? 'en' : 'es',
        JSON.stringify(body.meta && typeof body.meta === 'object' ? body.meta : {}).slice(0, 3000),
        nowIso(),
      ).run();
    return json({ ok: true }, 201);
  } catch (error) {
    return json({ error: 'Unable to record event' }, 400);
  }
}
