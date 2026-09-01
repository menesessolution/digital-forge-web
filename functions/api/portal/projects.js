import { ensureDatabase, json } from '../../lib/db.js';
import { requireClient } from '../../lib/auth.js';

export async function onRequestGet(context) {
  const auth = await requireClient(context);
  if (auth.response) return auth.response;
  const db = await ensureDatabase(context.env);
  const result = await db.prepare(`SELECT p.id,p.title,p.service,p.status,p.progress,p.due_date,p.description,
    p.payment_amount_cents,p.payment_currency,p.payment_status,p.created_at,p.updated_at,
    (SELECT COUNT(*) FROM project_versions v WHERE v.project_id=p.id) AS version_count,
    (SELECT COUNT(*) FROM project_versions v WHERE v.project_id=p.id AND v.status='review') AS pending_reviews
    FROM projects p WHERE p.client_id=? AND p.status!='archived'
    ORDER BY p.updated_at DESC`).bind(auth.client.id).all();
  return json({ projects: result.results || [] });
}
