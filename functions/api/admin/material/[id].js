import { cleanText, ensureDatabase, json } from '../../../lib/db.js';

export async function onRequestGet({ params,env }) {
  if (!env.FILES) return json({ error:'El almacenamiento privado no está disponible.' },503);
  const id = cleanText(params.id,100);
  const db = await ensureDatabase(env);
  const material = await db.prepare('SELECT r2_key,original_name FROM project_materials WHERE id=?').bind(id).first();
  if (!material) return json({ error:'Archivo no encontrado.' },404);
  const object = await env.FILES.get(material.r2_key);
  if (!object?.body) return json({ error:'Archivo no encontrado.' },404);
  const safe = String(material.original_name || 'material').replace(/["\r\n]/g,'_');
  return new Response(object.body,{ headers:{
    'content-type':'application/octet-stream','content-disposition':`attachment; filename="${safe}"`,
    'content-length':String(object.size),'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox",
  }});
}
