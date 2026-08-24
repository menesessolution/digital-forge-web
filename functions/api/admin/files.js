import { cleanText, ensureDatabase, json, makeId, nowIso } from '../../lib/db.js';

const allowedStatuses = new Set(['review','approved','changes_requested','final']);
const MAX_FILE_BYTES = 95 * 1024 * 1024;

function safeName(value) {
  return cleanText(value, 240).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'archivo';
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.FILES) return json({ error: 'Configura el binding R2 con el nombre FILES.' }, 503);
    const form = await request.formData();
    const file = form.get('file');
    const projectId = cleanText(form.get('project_id'), 100);
    const title = cleanText(form.get('title'), 240);
    const notes = cleanText(form.get('notes'), 3000);
    const status = allowedStatuses.has(form.get('status')) ? form.get('status') : 'review';
    if (!projectId || !title || !(file instanceof File)) return json({ error: 'Proyecto, título y archivo son requeridos.' }, 400);
    if (!file.size || file.size > MAX_FILE_BYTES) return json({ error: 'El archivo debe pesar menos de 95 MB.' }, 413);
    const db = await ensureDatabase(env);
    const project = await db.prepare('SELECT id,progress FROM projects WHERE id=?').bind(projectId).first();
    if (!project) return json({ error: 'Proyecto no encontrado.' }, 404);
    const count = await db.prepare('SELECT COALESCE(MAX(version_number),0) AS value FROM project_versions WHERE project_id=?').bind(projectId).first();
    const versionNumber = (count?.value || 0) + 1;
    const id = makeId('version');
    const key = `projects/${projectId}/${id}-${safeName(file.name)}`;
    await env.FILES.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
      customMetadata: { projectId, versionId: id, originalName: safeName(file.name) },
    });
    const now = nowIso();
    await db.batch([
      db.prepare(`INSERT INTO project_versions
        (id,project_id,version_number,title,notes,status,r2_key,original_name,content_type,size_bytes,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id,projectId,versionNumber,title,notes,status,key,file.name,file.type || 'application/octet-stream',file.size,now,now),
      db.prepare('UPDATE projects SET status=?,progress=?,updated_at=? WHERE id=?')
        .bind(status === 'final' ? 'delivered' : 'review', status === 'final' ? 100 : Math.max(80, project.progress || 0), now, projectId),
      db.prepare('INSERT INTO project_events (project_id,kind,detail,created_at) VALUES (?,?,?,?)')
        .bind(projectId,'version_uploaded',`Versión ${versionNumber}: ${title}`,now),
    ]);
    return json({ ok: true, id, version_number: versionNumber }, 201);
  } catch (error) {
    return json({ error: error.message || 'No se pudo subir el archivo.' }, 400);
  }
}
