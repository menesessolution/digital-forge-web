import { cleanText, ensureDatabase, json } from '../../../lib/db.js';

const safeVideoTypes = new Set(['video/mp4','video/quicktime','video/webm']);

export async function onRequestGet({ params, env, data, request }) {
  const id = cleanText(params.id,100);
  const db = await ensureDatabase(env);
  const version = await db.prepare(`SELECT v.r2_key,v.content_type FROM project_versions v
    JOIN projects p ON p.id=v.project_id WHERE v.id=? AND p.editor_id=?`).bind(id,data.editor.id).first();
  if (!version || !version.r2_key) return json({ error: 'Archivo no encontrado.' },404);
  const head = await env.FILES?.head(version.r2_key);
  if (!head) return json({ error: 'Archivo no encontrado.' },404);
  const rangeHeader = request.headers.get('range') || '';
  let range;
  let status = 200;
  if (rangeHeader) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
    if (!match) return new Response(null,{ status:416,headers:{ 'content-range':`bytes */${head.size}` } });
    const start = Number(match[1]);
    const end = match[2] ? Math.min(Number(match[2]),head.size - 1) : head.size - 1;
    if (start > end || start >= head.size) return new Response(null,{ status:416,headers:{ 'content-range':`bytes */${head.size}` } });
    range = { offset:start,length:end - start + 1 };
    status = 206;
  }
  const object = await env.FILES.get(version.r2_key,range ? { range } : undefined);
  if (!object?.body) return json({ error:'Archivo no encontrado.' },404);
  const contentType = safeVideoTypes.has(version.content_type) ? version.content_type : 'application/octet-stream';
  const headers = new Headers({
    'content-type':contentType,
    'cache-control':'private, no-store',
    'accept-ranges':'bytes',
    'content-length':String(range ? range.length : head.size),
    'x-content-type-options':'nosniff',
    'content-security-policy':"default-src 'none'; sandbox",
  });
  if (contentType === 'application/octet-stream') headers.set('content-disposition','attachment; filename="Digital-Forge-video"');
  if (range) headers.set('content-range',`bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`);
  return new Response(object.body,{ status,headers });
}
