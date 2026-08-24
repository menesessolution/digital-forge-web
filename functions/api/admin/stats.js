import { ensureDatabase, json } from '../../lib/db.js';

export async function onRequestGet({ env }) {
  const db = await ensureDatabase(env);
  const [leads, active, content, events, pageViews, whatsapp, paypal] = await db.batch([
    db.prepare('SELECT COUNT(*) AS value FROM leads'),
    db.prepare("SELECT COUNT(*) AS value FROM leads WHERE stage IN ('proposal','active')"),
    db.prepare("SELECT COUNT(*) AS value FROM content_items WHERE status = 'published'"),
    db.prepare("SELECT COUNT(*) AS value FROM events WHERE created_at >= datetime('now','-30 day')"),
    db.prepare("SELECT COUNT(*) AS value FROM events WHERE name = 'page_view' AND created_at >= datetime('now','-30 day')"),
    db.prepare("SELECT COUNT(*) AS value FROM events WHERE name = 'whatsapp_click' AND created_at >= datetime('now','-30 day')"),
    db.prepare("SELECT COUNT(*) AS value FROM events WHERE name = 'paypal_click' AND created_at >= datetime('now','-30 day')"),
  ]);
  return json({
    totalLeads: leads.results?.[0]?.value || 0,
    activeLeads: active.results?.[0]?.value || 0,
    publishedContent: content.results?.[0]?.value || 0,
    events30d: events.results?.[0]?.value || 0,
    pageViews30d: pageViews.results?.[0]?.value || 0,
    whatsappClicks30d: whatsapp.results?.[0]?.value || 0,
    paypalClicks30d: paypal.results?.[0]?.value || 0,
  });
}
