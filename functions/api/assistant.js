import { assertSameOrigin, hashIp } from '../lib/auth.js';
import { cleanText, ensureDatabase, json, nowIso } from '../lib/db.js';

const BUSINESS_CONTEXT = `Digital Forge ofrece únicamente dos áreas: edición de video y creación de páginas web.
Edición: shorts, videos largos, subtítulos y motion graphics, reutilización de contenido y adaptación para plataformas.
Web: landing pages, webs para empresas, portafolios profesionales, diseño adaptable, configuración y publicación.
No inventes clientes, resultados, métricas, precios, plazos ni políticas. Si preguntan por precios, explica que se cotiza según el proyecto.
Tu objetivo es orientar y calificar al prospecto preguntando de forma breve por servicio, objetivo, material disponible, fecha deseada y presupuesto aproximado.
Haz una sola pregunta por respuesta. Responde en el idioma del usuario. Cuando ya haya información suficiente, invita a continuar por WhatsApp o reservar una reunión. No afirmes que una reunión quedó reservada.`;

function fallbackReply(message, locale) {
  const text = message.toLowerCase();
  const es = locale !== 'en';
  if (/precio|costo|budget|price|cost/.test(text)) return es ? 'Cada proyecto se cotiza según el tipo de servicio y el material. ¿Qué presupuesto aproximado tienes pensado?' : 'Each project is quoted according to the service and material. What approximate budget do you have in mind?';
  if (/web|página|pagina|website|landing/.test(text)) return es ? 'Perfecto, podemos ayudarte con creación web. ¿Qué debe lograr principalmente la página?' : 'Great, we can help with website creation. What should the website primarily accomplish?';
  if (/video|reel|short|podcast|subtítulo|subtitle/.test(text)) return es ? 'Perfecto, podemos ayudarte con la edición. ¿Ya tienes el material grabado y qué formato necesitas?' : 'Great, we can help with editing. Do you already have the footage, and what format do you need?';
  if (/hola|hello|hi|buenas|hey/.test(text)) return es ? '¡Hola! Soy el asistente de Digital Forge. ¿Buscas edición de video o creación de una página web?' : 'Hello! I’m Digital Forge’s assistant. Are you looking for video editing or website creation?';
  return es ? 'Para orientarte mejor, ¿tu proyecto es de edición de video o de creación web?' : 'To guide you better, is your project for video editing or website creation?';
}

function extractText(response) {
  for (const item of response?.output || []) {
    if (item.type !== 'message') continue;
    for (const part of item.content || []) if (part.type === 'output_text' && part.text) return part.text;
  }
  return '';
}

export async function onRequestPost({ request, env }) {
  try {
    try { assertSameOrigin(request); } catch { return json({ error: 'Solicitud no permitida.' }, 403); }
    const body = await request.json();
    const message = cleanText(body.message, 700);
    const locale = body.locale === 'en' ? 'en' : 'es';
    if (!message) return json({ error: 'Escribe un mensaje.' }, 400);
    const history = Array.isArray(body.history) ? body.history.slice(-8).map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: cleanText(item?.content, 700),
    })).filter((item) => item.content) : [];
    const db = await ensureDatabase(env);
    const ipHash = await hashIp(request);
    const now = Date.now();
    const recent = await db.prepare('SELECT COUNT(*) AS count FROM assistant_requests WHERE ip_hash=? AND created_at>?')
      .bind(ipHash, now - 10 * 60 * 1000).first();
    if (Number(recent?.count || 0) >= 20) return json({ error: locale === 'en' ? 'Please wait a few minutes before trying again.' : 'Espera unos minutos antes de intentar nuevamente.' }, 429);
    await db.prepare('INSERT INTO assistant_requests (ip_hash,created_at) VALUES (?,?)').bind(ipHash, now).run();
    let reply = '';
    let mode = 'guided';
    if (env.OPENAI_API_KEY) {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || 'gpt-5.6-luna',
          instructions: BUSINESS_CONTEXT,
          input: [...history, { role: 'user', content: message }],
          max_output_tokens: 180,
          store: false,
        }),
      });
      if (response.ok) {
        reply = cleanText(extractText(await response.json()), 1200);
        if (reply) mode = 'ai';
      }
    }
    if (!reply) reply = fallbackReply(message, locale);
    await db.prepare('INSERT INTO events (name,path,locale,meta,created_at) VALUES (?,?,?,?,?)')
      .bind('assistant_message', '/', locale, JSON.stringify({ mode }), nowIso()).run();
    return json({ reply, mode });
  } catch {
    return json({ error: 'El asistente no está disponible en este momento.' }, 503);
  }
}
