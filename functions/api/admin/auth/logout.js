import { assertSameOrigin } from '../../../lib/auth.js';
import { destroyAdminSession } from '../../../lib/admin-auth.js';
import { json } from '../../../lib/db.js';

export async function onRequestPost({ env, request }) {
  try {
    assertSameOrigin(request);
    return json({ ok: true }, 200, { 'set-cookie': await destroyAdminSession(env, request) });
  } catch (error) {
    return json({ error: error.message || 'No se pudo cerrar la sesión.' }, 400);
  }
}
