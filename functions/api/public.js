import { ensureDatabase, json } from '../lib/db.js';

export async function onRequestGet({ env }) {
  try {
    const db = await ensureDatabase(env);
    const [content, settings] = await db.batch([
      db.prepare(`SELECT id,type,slug,title_es,title_en,excerpt_es,excerpt_en,body_es,body_en,
        media_url,cta_url,price_es,price_en,author,role_es,role_en,featured,sort_order
        FROM content_items WHERE status = 'published'
        ORDER BY featured DESC, sort_order ASC, created_at DESC`),
      db.prepare(`SELECT key,value FROM settings
        WHERE key IN ('paypal_url','calendly_url','booking_url','contact_email')`),
    ]);
    return json({
      content: content.results || [],
      settings: Object.fromEntries((settings.results || []).map((item) => [item.key, item.value])),
    });
  } catch (error) {
    return json({ error: 'Dynamic content is temporarily unavailable' }, 503);
  }
}
