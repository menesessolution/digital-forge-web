import { assertSameOrigin } from '../../lib/auth.js';
import { cleanText, ensureDatabase, json, makeId, nowIso } from '../../lib/db.js';
import { moderateProjectMessage, notificationInsert } from '../../lib/project-message.js';

const MAX_FILE_BYTES = 95 * 1024 * 1024;
const allowedStatuses = new Set(['review','final']);
const videoTypes = { mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',webm:'video/webm' };

function safeName(value) {
  return cleanText(value,240).replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'') || 'video';
}

async function videoMetadata(file) {
  const extension = /\.([a-z0-9]{2,5})$/i.exec(file.name || '')?.[1]?.toLowerCase() || '';
  const contentType = videoTypes[extension];
  if (!contentType || (file.type && !String(file.type).startsWith('video/'))) return null;
  const bytes = new Uint8Array(await file.slice(0,16).arrayBuffer());
  const valid = extension === 'webm'
    ? bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
    : String.fromCharCode(...bytes.slice(4,8)) === 'ftyp';
  return valid ? { extension,contentType } : null;
}

export async function onRequestPost({ request, env, data }) {
  try {
    assertSameOrigin(request);
    if (!env.FILES) return json({ error: 'El almacenamiento de archivos no está disponible.' },503);
    const form = await request.formData();
    const file = form.get('file');
    const projectId = cleanText(form.get('project_id'),100);
    const rawTitle = cleanText(form.get('title'),180);
    const rawNotes = cleanText(form.get('notes'),1800);
    const title = rawTitle ? moderateProjectMessage(rawTitle) : 'Nueva versión';
    const notes = rawNotes ? moderateProjectMessage(rawNotes) : '';
    const status = allowedStatuses.has(form.get('status')) ? form.get('status') : 'review';
    if (!projectId || !(file instanceof File)) return json({ error: 'Selecciona un proyecto y un video.' },400);
    const media = await videoMetadata(file);
    if (!media) return json({ error: 'El archivo no es un video MP4, MOV, M4V o WebM válido.' },400);
    if (!file.size || file.size > MAX_FILE_BYTES) return json({ error: 'El video debe pesar 95 MB o menos.' },413);
    const db = await ensureDatabase(env);
    const project = await db.prepare('SELECT id,client_id,progress,public_code FROM projects WHERE id=? AND editor_id=?').bind(projectId,data.editor.id).first();
    if (!project) return json({ error: 'Proyecto no encontrado.' },404);
    const count = await db.prepare('SELECT COALESCE(MAX(version_number),0) AS value FROM project_versions WHERE project_id=?').bind(projectId).first();
    const versionNumber = Number(count?.value || 0) + 1;
    const id = makeId('version');
    const { extension,contentType } = media;
    const publicName = `${safeName(project.public_code || 'Digital-Forge')}-V${versionNumber}.${extension}`;
    const key = `projects/${projectId}/${id}.${extension}`;
    await env.FILES.put(key,file.stream(),{
      httpMetadata: { contentType },
      customMetadata: { projectId,versionId:id,uploadedBy:'editor' },
    });
    const now = nowIso();
    await db.batch([
      db.prepare(`INSERT INTO project_versions
        (id,project_id,version_number,title,notes,status,r2_key,original_name,content_type,size_bytes,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id,projectId,versionNumber,title,notes,status,key,publicName,contentType,file.size,now,now),
      db.prepare('UPDATE projects SET status=?,progress=?,updated_at=? WHERE id=?')
        .bind(status === 'final' ? 'delivered' : 'review',status === 'final' ? 100 : Math.max(80,Number(project.progress || 0)),now,projectId),
      db.prepare('INSERT INTO project_events (project_id,kind,detail,created_at) VALUES (?,?,?,?)').bind(projectId,'version_uploaded',`Versión ${versionNumber} publicada por el equipo de edición`,now),
      notificationInsert(db,{ recipientRole:'client',recipientId:project.client_id,projectId,kind:'version_ready',title:'Nueva versión lista para revisar',body:`Versión ${versionNumber} · ${project.public_code || 'Proyecto Digital Forge'}` }),
    ]);
    return json({ ok: true,id,version_number:versionNumber },201);
  } catch (error) {
    return json({ error: error.message || 'No se pudo subir el video.' },400);
  }
}
