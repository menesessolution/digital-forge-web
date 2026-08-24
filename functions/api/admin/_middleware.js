import { json } from '../../lib/db.js';

async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a[i] ^ b[i];
  return result === 0;
}

export async function onRequest(context) {
  const secret = context.env.ADMIN_TOKEN;
  if (!secret) return json({ error: 'Admin access is not configured' }, 503);
  const header = context.request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !equalBytes(await digest(token), await digest(secret))) {
    return json({ error: 'Unauthorized' }, 401, { 'www-authenticate': 'Bearer' });
  }
  return context.next();
}
