import { cleanText, ensureDatabase, json } from '../../../lib/db.js';
import { requireClient } from '../../../lib/auth.js';

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
