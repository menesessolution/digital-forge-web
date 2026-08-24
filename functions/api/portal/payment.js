import { cleanText, ensureDatabase, json, nowIso } from '../../lib/db.js';
import { requireClient } from '../../lib/auth.js';

function makePayPalUrl(base, cents, currency) {
  try {
    const url = new URL(base);
    if (url.protocol !== 'https:' || !/(^|\.)paypal\.com$/i.test(url.hostname)) return '';
    const amount = (cents / 100).toFixed(2).replace(/\.00$/, '');
    url.pathname = `${url.pathname.replace(/\/$/, '')}/${amount}${currency}`;
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

export async function onRequestGet(context) {
  const auth = await requireClient(context);
  if (auth.response) return auth.response;
  const projectId = cleanText(new URL(context.request.url).searchParams.get('project'), 100);
  const db = await ensureDatabase(context.env);
  const project = await db.prepare(`SELECT id,title,payment_amount_cents,payment_currency,payment_status
    FROM projects WHERE id=? AND client_id=?`).bind(projectId, auth.client.id).first();
  if (!project) return json({ error: 'Proyecto no encontrado.' }, 404);
  if (!project.payment_amount_cents || project.payment_status !== 'pending') return json({ error: 'Este proyecto no tiene un pago pendiente.' }, 400);
  const setting = await db.prepare("SELECT value FROM settings WHERE key='paypal_url'").first();
  const target = makePayPalUrl(setting?.value || '', project.payment_amount_cents, project.payment_currency || 'USD');
  if (!target) return json({ error: 'El enlace de PayPal no está configurado.' }, 503);
  const now = nowIso();
  await db.batch([
    db.prepare('INSERT INTO project_events (project_id,kind,detail,created_at) VALUES (?,?,?,?)')
      .bind(project.id, 'payment_opened', `PayPal · ${project.payment_currency} ${(project.payment_amount_cents / 100).toFixed(2)}`, now),
    db.prepare('INSERT INTO events (name,path,locale,meta,created_at) VALUES (?,?,?,?,?)')
      .bind('paypal_project_click', '/portal/', auth.client.locale, JSON.stringify({ project_id: project.id }), now),
  ]);
  return new Response(null, { status: 302, headers: { location: target, 'cache-control': 'no-store' } });
}
