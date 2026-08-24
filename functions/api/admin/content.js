import { cleanText, ensureDatabase, json, makeId, nowIso } from '../../lib/db.js';

const allowedTypes = new Set(['portfolio','case_study','testimonial','pricing','blog']);
const allowedStatuses = new Set(['draft','published']);

function normalize(body) {
  const type = cleanText(body.type, 30);
  const status = cleanText(body.status || 'draft', 20);
  if (!allowedTypes.has(type) || !allowedStatuses.has(status)) throw new Error('Invalid content type or status');
  const titleEs = cleanText(body.title_es, 240);
  const titleEn = cleanText(body.title_en, 240);
  if (!titleEs || !titleEn) throw new Error('Spanish and English titles are required');
  const rawSlug = cleanText(body.slug || titleEs, 180).toLowerCase();
  const slug = rawSlug.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || crypto.randomUUID();
  return {
    type,
    status,
    slug,
    titleEs,
    titleEn,
    excerptEs: cleanText(body.excerpt_es, 800),
    excerptEn: cleanText(body.excerpt_en, 800),
    bodyEs: cleanText(body.body_es, 10000),
    bodyEn: cleanText(body.body_en, 10000),
    mediaUrl: cleanText(body.media_url, 1000),
    ctaUrl: cleanText(body.cta_url, 1000),
    priceEs: cleanText(body.price_es, 120),
    priceEn: cleanText(body.price_en, 120),
    author: cleanText(body.author, 180),
    roleEs: cleanText(body.role_es, 240),
    roleEn: cleanText(body.role_en, 240),
    featured: body.featured ? 1 : 0,
    sortOrder: Number.isFinite(Number(body.sort_order)) ? Math.trunc(Number(body.sort_order)) : 0,
  };
}

export async function onRequestGet({ env }) {
  const db = await ensureDatabase(env);
  const result = await db.prepare('SELECT * FROM content_items ORDER BY type, sort_order, created_at DESC').all();
  return json({ content: result.results || [] });
}

export async function onRequestPost({ request, env }) {
  try {
    const item = normalize(await request.json());
    const db = await ensureDatabase(env);
    const id = makeId('content');
    const now = nowIso();
    await db.prepare(`INSERT INTO content_items
      (id,type,slug,status,title_es,title_en,excerpt_es,excerpt_en,body_es,body_en,media_url,cta_url,price_es,price_en,author,role_es,role_en,featured,sort_order,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id,item.type,item.slug,item.status,item.titleEs,item.titleEn,item.excerptEs,item.excerptEn,item.bodyEs,item.bodyEn,item.mediaUrl,item.ctaUrl,item.priceEs,item.priceEn,item.author,item.roleEs,item.roleEn,item.featured,item.sortOrder,now,now).run();
    return json({ ok: true, id }, 201);
  } catch (error) {
    return json({ error: error.message || 'Unable to create content' }, 400);
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const body = await request.json();
    const id = cleanText(body.id, 100);
    if (!id) return json({ error: 'Content id is required' }, 400);
    const item = normalize(body);
    const db = await ensureDatabase(env);
    const result = await db.prepare(`UPDATE content_items SET
      type=?,slug=?,status=?,title_es=?,title_en=?,excerpt_es=?,excerpt_en=?,body_es=?,body_en=?,media_url=?,cta_url=?,price_es=?,price_en=?,author=?,role_es=?,role_en=?,featured=?,sort_order=?,updated_at=? WHERE id=?`)
      .bind(item.type,item.slug,item.status,item.titleEs,item.titleEn,item.excerptEs,item.excerptEn,item.bodyEs,item.bodyEn,item.mediaUrl,item.ctaUrl,item.priceEs,item.priceEn,item.author,item.roleEs,item.roleEn,item.featured,item.sortOrder,nowIso(),id).run();
    if (!result.meta?.changes) return json({ error: 'Content not found' }, 404);
    return json({ ok: true });
  } catch (error) {
    return json({ error: error.message || 'Unable to update content' }, 400);
  }
}

export async function onRequestDelete({ request, env }) {
  const id = cleanText(new URL(request.url).searchParams.get('id'), 100);
  if (!id) return json({ error: 'Content id is required' }, 400);
  const db = await ensureDatabase(env);
  const result = await db.prepare('DELETE FROM content_items WHERE id = ?').bind(id).run();
  if (!result.meta?.changes) return json({ error: 'Content not found' }, 404);
  return json({ ok: true });
}
