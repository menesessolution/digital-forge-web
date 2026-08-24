import { json } from '../../lib/db.js';
import { requireClient } from '../../lib/auth.js';

export async function onRequestGet(context) {
  const auth = await requireClient(context);
  if (auth.response) return auth.response;
  const { id, name, email, locale } = auth.client;
  return json({ client: { id, name, email, locale } });
}
