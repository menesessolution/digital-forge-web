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
  const object = await context.env.FILES.get(material.r2_key);
  if (!object?.body) return json({ error:'Archivo no encontrado.' },404);
  const safe = String(material.original_name || 'material').replace(/["\r\n]/g,'_');
  return new Response(object.body,{ headers:{
    'content-type':'application/octet-stream',
    'content-disposition':`attachment; filename="${safe}"`,
    'content-length':String(object.size),
    'cache-control':'private, no-store',
    'x-content-type-options':'nosniff',
    'content-security-policy':"default-src 'none'; sandbox",
  }});
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
