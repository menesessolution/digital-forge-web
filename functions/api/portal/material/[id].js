import { cleanText, ensureDatabase, json } from '../../../lib/db.js';
import { assertSameOrigin, requireClient } from '../../../lib/auth.js';

export async function onRequestGet(context) {
  const auth = await requireClient(context);
  if (auth.response) return auth.response;
  if (!context.env.FILES) return json({ error:'El almacenamiento privado no está disponible.' },503);
  const id = cleanText(context.params.id,100);
  const db = await ensureDatabase(context.env);
  const material = await db.prepare(`SELECT m.r2_key,m.original_name,m.content_type FROM project_materials m
    JOIN projects p ON p.id=m.project_id WHERE m.id=? AND p.client_id=?`).bind(id,auth.client.id).first();
  if (!material) return json({ error:'Archivo no encontrado.' },404);
  const head = await context.env.FILES.head(material.r2_key);
  if (!head) return json({ error:'Archivo no encontrado.' },404);
  const rangeHeader = context.request.headers.get('range');
  let range;
  let status = 200;
  if (rangeHeader) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
    if (!match) return new Response(null,{ status:416,headers:{ 'content-range':`bytes */${head.size}` } });
    const start = Number(match[1]);
    const end = match[2] ? Math.min(Number(match[2]),head.size-1) : head.size-1;
    if (start>end||start>=head.size) return new Response(null,{ status:416,headers:{ 'content-range':`bytes */${head.size}` } });
    range={ offset:start,length:end-start+1 };status=206;
  }
  const object = await context.env.FILES.get(material.r2_key,range?{ range }:undefined);
  if (!object?.body) return json({ error:'Archivo no encontrado.' },404);
  const safe = String(material.original_name || 'material').replace(/["\r\n]/g,'_');
  const preview = new URL(context.request.url).searchParams.get('preview')==='1';
  const safePreviewTypes = new Set(['video/mp4','video/quicktime','video/webm','audio/mpeg','audio/wav','audio/mp4','image/jpeg','image/png','image/webp']);
  const contentType = preview&&safePreviewTypes.has(material.content_type)?material.content_type:'application/octet-stream';
  const headers={
    'content-type':contentType,
    'content-disposition':`${preview&&contentType!=='application/octet-stream'?'inline':'attachment'}; filename="${safe}"`,
    'content-length':String(range?range.length:head.size),
    'cache-control':'private, no-store',
    'accept-ranges':'bytes',
    'x-content-type-options':'nosniff',
    'content-security-policy':"default-src 'none'; sandbox",
  };
  if (range) headers['content-range']=`bytes ${range.offset}-${range.offset+range.length-1}/${head.size}`;
  return new Response(object.body,{ status,headers });
}

export async function onRequestPatch(context) {
  const auth = await requireClient(context);
  if (auth.response) return auth.response;
  try {
    assertSameOrigin(context.request);
    const id = cleanText(context.params.id,100);
    const body = await context.request.json();
    const displayName = cleanText(body.display_name,120);
    if (!displayName) return json({ error:'Escribe un nombre para identificar el video.' },400);
    const db = await ensureDatabase(context.env);
    const material = await db.prepare(`SELECT m.id FROM project_materials m JOIN projects p ON p.id=m.project_id
      WHERE m.id=? AND p.client_id=?`).bind(id,auth.client.id).first();
    if (!material) return json({ error:'Archivo no encontrado.' },404);
    await db.prepare('UPDATE project_materials SET display_name=?,updated_at=? WHERE id=? AND client_id=?')
      .bind(displayName,new Date().toISOString(),id,auth.client.id).run();
    return json({ ok:true,id,display_name:displayName });
  } catch (error) {
    return json({ error:error.message || 'No se pudo cambiar el nombre.' },400);
  }
}

export async function onRequestDelete(context) {
  const auth = await requireClient(context);
  if (auth.response) return auth.response;
  try {
    assertSameOrigin(context.request);
    const id = cleanText(context.params.id,100);
    const db = await ensureDatabase(context.env);
    const material = await db.prepare(`SELECT m.r2_key,m.project_id,m.original_name FROM project_materials m
      JOIN projects p ON p.id=m.project_id WHERE m.id=? AND p.client_id=?`).bind(id,auth.client.id).first();
    if (!material) return json({ error:'Archivo no encontrado.' },404);
    if (context.env.FILES && material.r2_key) await context.env.FILES.delete(material.r2_key);
    const now = new Date().toISOString();
    await db.batch([
      db.prepare('DELETE FROM project_materials WHERE id=? AND client_id=?').bind(id,auth.client.id),
      db.prepare('INSERT INTO project_events (project_id,kind,detail,created_at) VALUES (?,?,?,?)')
        .bind(material.project_id,'material_deleted','El cliente eliminó un archivo de material en crudo',now),
    ]);
    return json({ ok:true,id });
  } catch (error) {
    return json({ error:error.message || 'No se pudo eliminar el archivo.' },400);
  }
}
