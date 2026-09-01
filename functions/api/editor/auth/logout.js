import { assertSameOrigin } from '../../../lib/auth.js';
import { destroyEditorSession } from '../../../lib/editor-auth.js';
import { json } from '../../../lib/db.js';

export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    return json({ ok: true },200,{ 'set-cookie': await destroyEditorSession(env,request) });
  } catch (error) {
    return json({ error: error.message || 'No se pudo cerrar la sesión.' },400);
  }
}
