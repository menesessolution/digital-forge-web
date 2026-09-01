import { json } from '../../../lib/db.js';
import { requireEditor } from '../../../lib/editor-auth.js';

export async function onRequestGet(context) {
  const auth = await requireEditor(context);
  if (auth.response) return auth.response;
  return json({ editor: { name: auth.editor.name, alias: auth.editor.alias, must_change_password: Boolean(auth.editor.must_change_password) } });
}
