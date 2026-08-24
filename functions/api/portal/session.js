import { json } from '../../lib/db.js';
import { requireClient } from '../../lib/auth.js';

export async function onRequestGet(context) {
  const auth = await requireClient(context);
  if (auth.response) return auth.response;
  const { id, name, email, locale, must_change_password } = auth.client;
  return json({ client: { id, name, email, locale, must_change_password: Boolean(must_change_password) } });
}
