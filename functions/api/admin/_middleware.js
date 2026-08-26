import { requireAdmin } from '../../lib/admin-auth.js';

export async function onRequest(context) {
  if (new URL(context.request.url).pathname.startsWith('/api/admin/auth/')) return context.next();
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  context.data.admin = auth.admin;
  return context.next();
}
