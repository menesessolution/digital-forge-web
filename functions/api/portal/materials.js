import { assertSameOrigin, requireClient } from '../../lib/auth.js';
import { cleanText, ensureDatabase, json, makeId, nowIso } from '../../lib/db.js';
import { notificationInsert } from '../../lib/project-message.js';

const MAX_FILE_BYTES = 95 * 1024 * 1024;
const allowedExtensions = new Set([
  'mp4','mov','m4v','webm','avi','mkv','mts','m2ts','braw','r3d',
  'mp3','wav','m4a','aac','aiff','flac',
  'jpg','jpeg','png','webp','heic','heif','dng','cr2','cr3','arw','nef',
  'zip','7z','rar','pdf','txt','doc','docx',
]);

function extensionOf(name) {
  return /\.([a-z0-9]{1,8})$/i.exec(String(name || ''))?.[1]?.toLowerCase() || '';
}

function safeName(value) {
  return cleanText(value,240).replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'') || 'material';
}

export async function onRequestPost(context) {
  const auth = await requireClient(context);
  if (auth.response) return auth.response;
  try {
    assertSameOrigin(context.request);
    if (!context.env.FILES) return json({ error:'El almacenamiento privado no está disponible.' },503);
    const form = await context.request.formData();
    const projectId = cleanText(form.get('project_id'),100);
    const file = form.get('file');
    if (!projectId || !(file instanceof File)) return json({ error:'Selecciona un proyecto y un archivo.' },400);
    if (!file.size) return json({ error:'El archivo está vacío.' },400);
    if (file.size > MAX_FILE_BYTES) return json({ error:'El archivo supera 95 MB. Envíanos un correo para coordinar la entrega.' },413);
    const extension = extensionOf(file.name);
    if (!allowedExtensions.has(extension)) return json({ error:'Ese tipo de archivo no está permitido. Usa video, audio, imagen, PDF o un archivo comprimido.' },400);

    const db = await ensureDatabase(context.env);
    const project = await db.prepare('SELECT id,editor_id,title FROM projects WHERE id=? AND client_id=?').bind(projectId,auth.client.id).first();
    if (!project) return json({ error:'Proyecto no encontrado.' },404);
    const id = makeId('material');
    const originalName = safeName(file.name);
    const contentType = cleanText(file.type,120) || 'application/octet-stream';
    const key = `materials/${projectId}/${id}-${originalName}`;
    await context.env.FILES.put(key,file.stream(),{
      httpMetadata:{ contentType },
      customMetadata:{ projectId,clientId:auth.client.id,materialId:id,uploadedBy:'client' },
    });
    const now = nowIso();
    const operations = [
      db.prepare(`INSERT INTO project_materials
        (id,project_id,client_id,original_name,content_type,size_bytes,r2_key,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,'uploaded',?,?)`).bind(id,projectId,auth.client.id,originalName,contentType,file.size,key,now,now),
      db.prepare('INSERT INTO project_events (project_id,kind,detail,created_at) VALUES (?,?,?,?)')
        .bind(projectId,'material_uploaded','El cliente subió nuevo material en crudo',now),
    ];
    if (project.editor_id) operations.push(notificationInsert(db,{ recipientRole:'editor',recipientId:project.editor_id,projectId,kind:'material_uploaded',title:'Nuevo material disponible',body:'El cliente agregó un archivo al proyecto.' }));
    await db.batch(operations);
    return json({ ok:true,material:{ id,project_id:projectId,original_name:originalName,content_type:contentType,size_bytes:file.size,status:'uploaded',created_at:now } },201);
  } catch (error) {
    return json({ error:error.message || 'No se pudo subir el material.' },400);
  }
}
