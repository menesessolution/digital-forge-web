import { secretMatches } from '../lib/admin-auth.js';
import { ensureDatabase, json, nowIso } from '../lib/db.js';

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const access = url.searchParams.get('access') || '';
    const db = await ensureDatabase(env);
    const [tokenSetting, paypalSetting] = await db.batch([
      db.prepare("SELECT value FROM settings WHERE key='payment_access_token'"),
      db.prepare("SELECT value FROM settings WHERE key='paypal_url'"),
    ]);
    const expected = tokenSetting.results?.[0]?.value || '';
    if (!await secretMatches(access, expected)) return json({ error: 'Enlace privado no válido.' }, 403);
    await db.prepare('INSERT INTO events (name,path,locale,meta,created_at) VALUES (?,?,?,?,?)')
      .bind('payment_methods_view', '/pagos/', 'es', '{}', nowIso()).run();
    return json({
      paypal_url: paypalSetting.results?.[0]?.value || 'https://www.paypal.com/paypalme/MariaRios810',
      nu_key: '@MHW032',
      arq_key: '$digitalforge',
      binance_url: 'https://www.binance.com/activity/referral-entry/CPA?ref=CPA_00UVUP2RO1',
      binance_referral_code: 'CPA_00UVUP2RO1',
    });
  } catch (error) {
    return json({ error: 'No se pudo validar el enlace privado.' }, 400);
  }
}
