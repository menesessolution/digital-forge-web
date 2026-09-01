import { cleanText, ensureDatabase, json, makeId, nowIso } from '../../lib/db.js';
import { assertSameOrigin } from '../../lib/auth.js';
import { notificationInsert } from '../../lib/project-message.js';

const allowedStatuses = new Set(['review','approved','changes_requested','final']);
const MAX_FILE_BYTES = 95 * 1024 * 1024;
const videoTypes = { mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',webm:'video/webm' };

function safeName(value) {
  return cleanText(value, 240).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'archivo';
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

export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    if (!env.FILES) return json({ error: 'Configura el binding R2 con el nombre FILES.' }, 503);
    const form = await request.formData();
    const file = form.get('file');
    const projectId = cleanText(form.get('project_id'), 100);
    const title = cleanText(form.get('title'), 240);
    const notes = cleanText(form.get('notes'), 3000);
    const status = allowedStatuses.has(form.get('status')) ? form.get('status') : 'review';
    if (!projectId || !title || !(file instanceof File)) return json({ error: 'Proyecto, título y archivo son requeridos.' }, 400);
    const media = await videoMetadata(file);
    if (!media) return json({ error: 'El archivo no es un video MP4, MOV, M4V o WebM válido.' },400);
    if (!file.size || file.size > MAX_FILE_BYTES) return json({ error: 'El archivo debe pesar menos de 95 MB.' }, 413);
    const db = await ensureDatabase(env);
    const project = await db.prepare('SELECT id,client_id,editor_id,progress,public_code FROM projects WHERE id=?').bind(projectId).first();
    if (!project) return json({ error: 'Proyecto no encontrado.' }, 404);
    const count = await db.prepare('SELECT COALESCE(MAX(version_number),0) AS value FROM project_versions WHERE project_id=?').bind(projectId).first();
    const versionNumber = (count?.value || 0) + 1;
    const id = makeId('version');
    const key = `projects/${projectId}/${id}.${media.extension}`;
    await env.FILES.put(key, file.stream(), {
      httpMetadata: { contentType: media.contentType },
      customMetadata: { projectId, versionId: id, originalName: safeName(file.name) },
    });
    const now = nowIso();
    const statements = [
      db.prepare(`INSERT INTO project_versions
        (id,project_id,version_number,title,notes,status,r2_key,original_name,content_type,size_bytes,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id,projectId,versionNumber,title,notes,status,key,safeName(file.name),media.contentType,file.size,now,now),
      db.prepare('UPDATE projects SET status=?,progress=?,updated_at=? WHERE id=?')
        .bind(status === 'final' ? 'delivered' : 'review', status === 'final' ? 100 : Math.max(80, project.progress || 0), now, projectId),
      db.prepare('INSERT INTO project_events (project_id,kind,detail,created_at) VALUES (?,?,?,?)')
        .bind(projectId,'version_uploaded',`Versión ${versionNumber}: ${title}`,now),
      notificationInsert(db,{ recipientRole:'client',recipientId:project.client_id,projectId,kind:'version_ready',title:'Nueva versión lista para revisar',body:`Versión ${versionNumber} · ${project.public_code || 'Proyecto Digital Forge'}` }),
    ];
    if (project.editor_id) statements.push(notificationInsert(db,{ recipientRole:'editor',recipientId:project.editor_id,projectId,kind:'version_published',title:'Versión publicada en el proyecto',body:`Versión ${versionNumber} · ${project.public_code || 'Proyecto Digital Forge'}` }));
    await db.batch(statements);
    return json({ ok: true, id, version_number: versionNumber }, 201);
  } catch (error) {
    return json({ error: error.message || 'No se pudo subir el archivo.' }, 400);
  }
}
