import { json } from '../../lib/db.js';
import { assertSameOrigin, destroySession } from '../../lib/auth.js';

export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    const cookie = await destroySession(env, request);
    return json({ ok: true }, 200, { 'set-cookie': cookie });
  } catch (error) {
    return json({ error: error.message || 'No se pudo cerrar la sesión.' }, 400);
  }
}
