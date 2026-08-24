import { cleanText, ensureDatabase, json, makeId, nowIso } from '../lib/db.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

async function sendAutomaticEmails(env, lead) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !env.EMAIL_TO) return { configured: false };
  const commonHeaders = {
    authorization: `Bearer ${env.RESEND_API_KEY}`,
    'content-type': 'application/json',
  };
  const notification = fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: commonHeaders,
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [env.EMAIL_TO],
      reply_to: lead.email,
      subject: `Nuevo lead de Digital Forge: ${lead.service}`,
      html: `<h2>Nueva solicitud</h2><p><strong>Nombre:</strong> ${escapeHtml(lead.name)}</p><p><strong>Email:</strong> ${escapeHtml(lead.email)}</p><p><strong>Teléfono:</strong> ${escapeHtml(lead.phone)}</p><p><strong>Servicio:</strong> ${escapeHtml(lead.service)}</p><p><strong>Proyecto:</strong> ${escapeHtml(lead.projectType)}</p><p><strong>Necesidad:</strong> ${escapeHtml(lead.goal)}</p><p>${escapeHtml(lead.message)}</p>`,
    }),
  });
  const confirmation = fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: commonHeaders,
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [lead.email],
      subject: lead.locale === 'en' ? 'We received your Digital Forge request' : 'Recibimos tu solicitud en Digital Forge',
      html: lead.locale === 'en'
        ? `<p>Hello ${escapeHtml(lead.name)},</p><p>We received your request and will contact you soon. You can also continue the conversation through WhatsApp.</p><p>Digital Forge</p>`
        : `<p>Hola ${escapeHtml(lead.name)},</p><p>Recibimos tu solicitud y te contactaremos pronto. También puedes continuar la conversación por WhatsApp.</p><p>Digital Forge</p>`,
    }),
  });
  const results = await Promise.allSettled([notification, confirmation]);
  return { configured: true, sent: results.every((result) => result.status === 'fulfilled' && result.value.ok) };
}

export async function onRequestPost({ request, env, waitUntil }) {
  try {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: 'Forbidden' }, 403);
    const body = await request.json();
    if (cleanText(body.companyWebsite, 200)) return json({ ok: true }, 201);

    const lead = {
      name: cleanText(body.name, 120),
      email: cleanText(body.email, 180).toLowerCase(),
      phone: cleanText(body.phone, 60),
      service: cleanText(body.service, 160),
      projectType: cleanText(body.projectType, 160),
      goal: cleanText(body.goal, 240),
      message: cleanText(body.message, 3000),
      locale: body.locale === 'en' ? 'en' : 'es',
      source: cleanText(body.source || 'website', 100),
    };
    if (lead.name.length < 2 || !emailPattern.test(lead.email) || !lead.service) {
      return json({ error: 'Please provide a valid name, email and service' }, 400);
    }

    const db = await ensureDatabase(env);
    const id = makeId('lead');
    const now = nowIso();
    await db.batch([
      db.prepare(`INSERT INTO leads
        (id,name,email,phone,service,project_type,goal,message,locale,source,stage,notes,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,'new','',?,?)`)
        .bind(id, lead.name, lead.email, lead.phone, lead.service, lead.projectType, lead.goal, lead.message, lead.locale, lead.source, now, now),
      db.prepare('INSERT INTO events (name,path,locale,meta,created_at) VALUES (?,?,?,?,?)')
        .bind('lead_submitted', '/#contact', lead.locale, JSON.stringify({ service: lead.service }), now),
    ]);
    waitUntil(sendAutomaticEmails(env, lead));
    return json({ ok: true, id }, 201);
  } catch (error) {
    return json({ error: 'Unable to save the request' }, 400);
  }
}
