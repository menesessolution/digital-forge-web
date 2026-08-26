import { authenticateAdmin } from '../../../lib/admin-auth.js';
import { json } from '../../../lib/db.js';

export async function onRequestGet({ env, request }) {
  const admin = await authenticateAdmin(env, request);
  if (!admin) return json({ error: 'Unauthorized' }, 401);
  return json({ admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } });
}
