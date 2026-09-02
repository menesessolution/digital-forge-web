import { cleanText, ensureDatabase, json } from '../../lib/db.js';
import { loadProjectMessages, publicMessages, redactExternalContacts } from '../../lib/project-message.js';

export async function onRequestGet({ request, env, data }) {
  const id = cleanText(new URL(request.url).searchParams.get('id'),100);
  const db = await ensureDatabase(env);
  const project = await db.prepare(`SELECT p.id,p.public_code,p.editor_title,p.editor_brief,p.service,p.status,p.progress,p.due_date,p.updated_at,
    c.name AS private_client_name,c.email AS private_client_email
    FROM projects p JOIN clients c ON c.id=p.client_id WHERE p.id=? AND p.editor_id=?`).bind(id,data.editor.id).first();
  if (!project) return json({ error: 'Proyecto no encontrado.' },404);
  const [versions,materials,events,messages] = await Promise.all([
    db.prepare(`SELECT id,project_id,version_number,title,notes,status,content_type,size_bytes,created_at,updated_at
      FROM project_versions WHERE project_id=? ORDER BY version_number DESC`).bind(id).all(),
    db.prepare(`SELECT id,content_type,size_bytes,status,created_at FROM project_materials
      WHERE project_id=? ORDER BY created_at DESC`).bind(id).all(),
    db.prepare(`SELECT id,project_id,kind,detail,created_at FROM project_events WHERE project_id=?
      AND kind IN ('version_uploaded','material_uploaded','approved','changes_requested','editor_comment','client_comment','admin_comment')
      ORDER BY created_at DESC LIMIT 80`).bind(id).all(),
    loadProjectMessages(db,id),
  ]);
  const privateValues = [project.private_client_name,project.private_client_email];
  const redactedCode = redactExternalContacts(project.public_code,privateValues);
  const safeProject = {
    id: project.id,
    public_code: redactedCode && !redactedCode.includes('[dato protegido]') ? redactedCode : `DF-${project.id.slice(-6).toUpperCase()}`,
    editor_title: redactExternalContacts(project.editor_title || 'Proyecto de edición',privateValues),
    editor_brief: redactExternalContacts(project.editor_brief,privateValues),
    service: redactExternalContacts(project.service,privateValues),
    status: project.status,
    progress: project.progress,
    due_date: project.due_date,
    updated_at: project.updated_at,
  };
  return json({
    project: safeProject,
    versions: (versions.results || []).map((version) => ({ ...version,title:redactExternalContacts(version.title,privateValues),notes:redactExternalContacts(version.notes,privateValues) })),
    materials: (materials.results || []).map((material,index) => ({ ...material,display_name:`Material ${String((materials.results || []).length-index).padStart(2,'0')}` })),
    comments: publicMessages(messages,'editor').map((message) => ({ ...message,message:redactExternalContacts(message.message,privateValues) })),
    events: (events.results || []).map((event) => ({ ...event,detail:redactExternalContacts(event.detail,privateValues) })),
  });
}
