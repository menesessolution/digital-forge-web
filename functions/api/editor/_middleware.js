import { requireEditor } from '../../lib/editor-auth.js';

export async function onRequest(context) {
  if (new URL(context.request.url).pathname.startsWith('/api/editor/auth/')) return context.next();
  const auth = await requireEditor(context);
  if (auth.response) return auth.response;
  if (auth.editor.must_change_password) {
    return new Response(JSON.stringify({ error:'Debes cambiar la contraseña temporal antes de abrir proyectos.' }),{
      status:403,
      headers:{ 'content-type':'application/json; charset=utf-8','cache-control':'no-store' },
    });
  }
  context.data.editor = auth.editor;
  return context.next();
}
