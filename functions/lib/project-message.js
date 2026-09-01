import { cleanText, makeId, nowIso } from './db.js';

const disrespectfulTerms = [
  'idiota','imbecil','imbécil','estupido','estúpido','pendejo','pendeja','cabron','cabrón',
  'maricon','maricón','malparido','malparida','hijueputa','gonorrea','mierda','puta','puto',
  'inutil','inútil','basura','asqueroso','asquerosa','callate','cállate','fuck','fucking',
  'shit','bitch','asshole','idiot','stupid','moron','dumb','trash','porqueria','porquería',
  'ridiculo','ridícula','ridiculo','ridículo','incompetente','worthless','useless',
];

function normalized(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function privateTokens(values) {
  const tokens = [];
  for (const value of values || []) {
    const raw = cleanText(value, 300);
    if (!raw) continue;
    tokens.push(raw);
    const identitySource = raw.includes('@') ? raw.split('@')[0] : raw;
    for (const part of identitySource.split(/[\s._+-]+/)) if (part.length >= 3) tokens.push(part);
  }
  return [...new Set(tokens)].sort((a,b) => b.length - a.length);
}

export function redactPrivateText(value, values = []) {
  let result = cleanText(value, 5000);
  for (const token of privateTokens(values)) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`(^|[^a-z0-9áéíóúñ])${escaped}(?=$|[^a-z0-9áéíóúñ])`,'gi'),'$1[dato protegido]');
  }
  return result;
}

export function redactExternalContacts(value, values = []) {
  let result = cleanText(value,5000)
    .replace(/https?:\/\/\S+|www\.\S+/gi, '[dato protegido]')
    .replace(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi, '[dato protegido]')
    .replace(/(^|\s)@[a-z0-9._-]{2,}/gi, '$1[dato protegido]');
  result = result.replace(/(?:\+?\d[\s().-]*){7,}/g, (candidate) => (
    candidate.replace(/\D/g, '').length >= 7 ? '[dato protegido]' : candidate
  ));
  return redactPrivateText(result,values);
}

export function protectClientIdentity(message, client) {
  const safe = normalized(message);
  const exposed = privateTokens([client?.name,client?.email]).some((token) => {
    const escaped = normalized(token).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`,'i').test(safe);
  });
  if (exposed) throw new Error('Por privacidad, no incluyas tu nombre ni correo en el chat. El editor trabaja con un código anónimo.');
  return message;
}

function withoutEditingNumbers(value) {
  return value
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
    .replace(/\b(?:9:16|16:9|1:1|4:5|21:9)\b/g, ' ')
    .replace(/\b\d{3,4}\s*[x×]\s*\d{3,4}\b/gi, ' ')
    .replace(/\b(?:24|25|30|50|60|120)\s*fps\b/gi, ' ')
    .replace(/\bv\d+(?:\.\d+)?\b/gi, ' ');
}

export function moderateProjectMessage(value) {
  const message = cleanText(value, 1800);
  if (!message) throw new Error('Escribe un mensaje sobre el proyecto.');
  if (/https?:\/\/|www\.|(?:^|\s)[a-z0-9-]+\.(?:com|net|org|io|co|me|app|dev)(?:\b|\/)/i.test(message)) {
    throw new Error('Por seguridad, el chat no permite enlaces externos.');
  }
  if (/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/i.test(message) || /(?:^|\s)@[a-z0-9._-]{2,}/i.test(message)) {
    throw new Error('Por privacidad, no compartas correos ni usuarios de redes sociales.');
  }
  const digitsCandidate = withoutEditingNumbers(message);
  const phoneLike = digitsCandidate.match(/(?:\+?\d[\s().-]*){7,}/g) || [];
  if (phoneLike.some((candidate) => candidate.replace(/\D/g, '').length >= 7)) {
    throw new Error('Por privacidad, no compartas números de teléfono.');
  }
  const safe = normalized(message);
  const deobfuscated = safe
    .replace(/[4@]/g,'a').replace(/[3]/g,'e').replace(/[1!|]/g,'i').replace(/[0]/g,'o').replace(/[5$]/g,'s').replace(/[7]/g,'t')
    .replace(/(?:^|[^a-z0-9])((?:[a-z0-9][\s._-]+){3,}[a-z0-9])(?=$|[^a-z0-9])/g,(match,sequence)=>match.replace(sequence,sequence.replace(/[\s._-]+/g,'')));
  if (/(?:mi|por|al|escribeme|contactame|llamame|write me|contact me)\s+(?:por|al|en|on)?\s*(?:whatsapp|wa|wpp|telegram|discord|instagram|insta|ig|dm|correo|email)\b/.test(deobfuscated)) {
    throw new Error('Mantén toda la conversación dentro del portal.');
  }
  const numberWords = deobfuscated.match(/\b(?:(?:cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|zero|one|two|three|four|five|six|seven|eight|nine)[\s,.-]*){7,}\b/g);
  if (numberWords) throw new Error('Por privacidad, no compartas números de teléfono escritos con palabras.');
  if (/\b(?:mi nombre es|me llamo|puedes llamarme|my name is|call me|i am reachable|mi direccion|my address)\b/.test(deobfuscated)) {
    throw new Error('Por privacidad, no compartas datos de identidad o contacto. El proyecto usa un código anónimo.');
  }
  if (disrespectfulTerms.some((term) => new RegExp(`(?:^|[^a-z0-9])${normalized(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z0-9])`, 'i').test(deobfuscated))) {
    throw new Error('Ese mensaje contiene lenguaje que no cumple las normas de respeto del proyecto.');
  }
  return message;
}

export async function loadProjectMessages(db, projectId, limit = 500) {
  const result = await db.prepare(`SELECT * FROM (
      SELECT id,project_id,version_id,author_role AS sender_role,client_id AS sender_id,
        author_name AS author_label,message,time_seconds,'allowed' AS moderation_status,created_at
      FROM project_comments WHERE project_id=?
      UNION ALL
      SELECT id,project_id,version_id,sender_role,sender_id,author_label,message,time_seconds,moderation_status,created_at
      FROM project_messages WHERE project_id=? AND moderation_status='allowed'
    ) ORDER BY created_at ASC LIMIT ?`)
    .bind(projectId, projectId, Math.max(1, Math.min(Number(limit) || 500, 1000))).all();
  return result.results || [];
}

export function messageInsert(db, { projectId, versionId = '', senderRole, senderId = '', authorLabel, message, timeSeconds = -1 }) {
  return db.prepare(`INSERT INTO project_messages
    (id,project_id,version_id,sender_role,sender_id,author_label,message,time_seconds,moderation_status,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .bind(makeId('message'),projectId,versionId,senderRole,senderId,authorLabel,message,timeSeconds,'allowed',nowIso());
}

export function notificationInsert(db, { recipientRole, recipientId = '', projectId = '', kind, title, body = '' }) {
  return db.prepare(`INSERT INTO project_notifications
    (id,recipient_role,recipient_id,project_id,kind,title,body,read_at,created_at)
    VALUES (?,?,?,?,?,?,?,'',?)`)
    .bind(makeId('notice'),recipientRole,recipientId,projectId,kind,cleanText(title,180),cleanText(body,300),nowIso());
}

export function publicMessages(messages, viewerRole) {
  return messages.map((item) => ({
    ...item,
    author_role: item.sender_role,
    author_name: item.sender_role === 'admin'
      ? 'Digital Forge'
      : item.sender_role === viewerRole
        ? 'Tú'
        : item.sender_role === 'client'
          ? 'Cliente del proyecto'
          : 'Equipo de edición',
    sender_id: undefined,
    author_label: undefined,
  }));
}
