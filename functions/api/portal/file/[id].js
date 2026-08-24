import { cleanText, ensureDatabase, json } from '../../../lib/db.js';
import { requireClient } from '../../../lib/auth.js';

function contentDisposition(name, download) {
  const safe = String(name || 'archivo').replace(/["\r\n]/g, '_');
  return `${download ? 'attachment' : 'inline'}; filename="${safe}"`;
}

export async function onRequestGet(context) {
  const auth = await requireClient(context);
  if (auth.response) return auth.response;
  if (!context.env.FILES) return json({ error: 'El almacenamiento privado no está configurado.' }, 503);
  const versionId = cleanText(context.params.id, 100);
  const db = await ensureDatabase(context.env);
  const version = await db.prepare(`SELECT v.r2_key,v.original_name,v.content_type,v.size_bytes
    FROM project_versions v JOIN projects p ON p.id=v.project_id
    WHERE v.id=? AND p.client_id=?`).bind(versionId, auth.client.id).first();
  if (!version || !version.r2_key) return json({ error: 'Archivo no encontrado.' }, 404);
  const head = await context.env.FILES.head(version.r2_key);
  if (!head) return json({ error: 'Archivo no encontrado.' }, 404);
  const rangeHeader = context.request.headers.get('range');
  let range;
  let status = 200;
  if (rangeHeader) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
    if (!match) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${head.size}` } });
    const start = Number(match[1]);
    const end = match[2] ? Math.min(Number(match[2]), head.size - 1) : head.size - 1;
    if (start > end || start >= head.size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${head.size}` } });
    range = { offset: start, length: end - start + 1 };
    status = 206;
  }
  const object = await context.env.FILES.get(version.r2_key, range ? { range } : undefined);
  if (!object?.body) return json({ error: 'Archivo no encontrado.' }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('content-type', version.content_type || headers.get('content-type') || 'application/octet-stream');
  headers.set('content-disposition', contentDisposition(version.original_name, new URL(context.request.url).searchParams.get('download') === '1'));
  headers.set('accept-ranges', 'bytes');
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'private, no-store');
  if (range) {
    headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`);
    headers.set('content-length', String(range.length));
  } else {
    headers.set('content-length', String(head.size));
  }
  return new Response(object.body, { status, headers });
}
