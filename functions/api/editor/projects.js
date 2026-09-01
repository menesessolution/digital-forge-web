import { ensureDatabase, json } from '../../lib/db.js';
import { redactExternalContacts } from '../../lib/project-message.js';

export async function onRequestGet({ env, data }) {
  const db = await ensureDatabase(env);
  const result = await db.prepare(`SELECT p.id,p.public_code,p.editor_title,p.editor_brief,p.service,p.status,p.progress,p.due_date,p.updated_at,
    c.name AS private_client_name,c.email AS private_client_email,
    (SELECT COUNT(*) FROM project_versions v WHERE v.project_id=p.id) AS version_count,
    (SELECT COUNT(*) FROM project_versions v WHERE v.project_id=p.id AND v.status='changes_requested') AS changes_count,
    (SELECT COUNT(*) FROM project_messages m WHERE m.project_id=p.id AND m.sender_role='client' AND m.created_at>COALESCE(e.last_login_at,'')) AS new_client_messages
    FROM projects p JOIN editors e ON e.id=p.editor_id JOIN clients c ON c.id=p.client_id
    WHERE p.editor_id=? AND p.status!='archived' ORDER BY p.updated_at DESC`)
    .bind(data.editor.id).all();
  return json({ projects: (result.results || []).map((project) => {
    const privateValues = [project.private_client_name,project.private_client_email];
    const redactedCode = redactExternalContacts(project.public_code,privateValues);
    return {
      id:project.id,
      public_code:redactedCode && !redactedCode.includes('[dato protegido]') ? redactedCode : `DF-${project.id.slice(-6).toUpperCase()}`,
      editor_title:redactExternalContacts(project.editor_title || 'Proyecto de edición',privateValues),
      editor_brief:redactExternalContacts(project.editor_brief,privateValues),
      service:redactExternalContacts(project.service,privateValues),status:project.status,progress:project.progress,due_date:project.due_date,updated_at:project.updated_at,
      version_count:project.version_count,changes_count:project.changes_count,new_client_messages:project.new_client_messages,
    };
  }) });
}
