import { cleanText, ensureDatabase, json } from '../../../lib/db.js';

export async function onRequestGet({ params,env,data }) {
  if (!env.FILES) return json({ error:'El almacenamiento privado no está disponible.' },503);
  const id = cleanText(params.id,100);
  const db = await ensureDatabase(env);
  const material = await db.prepare(`SELECT m.r2_key,m.original_name,m.content_type FROM project_materials m
    JOIN projects p ON p.id=m.project_id WHERE m.id=? AND p.editor_id=?`).bind(id,data.editor.id).first();
  if (!material) return json({ error:'Archivo no encontrado.' },404);
  const object = await env.FILES.get(material.r2_key);
  if (!object?.body) return json({ error:'Archivo no encontrado.' },404);
  const extension = /\.([a-z0-9]{1,8})$/i.exec(material.original_name || '')?.[1]?.toLowerCase() || 'bin';
  return new Response(object.body,{ headers:{
    'content-type':'application/octet-stream',
    'content-disposition':`attachment; filename="Material-Digital-Forge-${id.slice(-6)}.${extension}"`,
    'content-length':String(object.size),
    'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox",
  }});
}
