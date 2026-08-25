const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS content_items (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('portfolio','case_study','testimonial','pricing','blog')),
    slug TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
    title_es TEXT NOT NULL DEFAULT '',
    title_en TEXT NOT NULL DEFAULT '',
    excerpt_es TEXT NOT NULL DEFAULT '',
    excerpt_en TEXT NOT NULL DEFAULT '',
    body_es TEXT NOT NULL DEFAULT '',
    body_en TEXT NOT NULL DEFAULT '',
    media_url TEXT NOT NULL DEFAULT '',
    cta_url TEXT NOT NULL DEFAULT '',
    price_es TEXT NOT NULL DEFAULT '',
    price_en TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL DEFAULT '',
    role_es TEXT NOT NULL DEFAULT '',
    role_en TEXT NOT NULL DEFAULT '',
    featured INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_content_type_slug ON content_items(type, slug)`,
  `CREATE INDEX IF NOT EXISTS idx_content_public ON content_items(status, type, sort_order)`,
  `CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    service TEXT NOT NULL,
    project_type TEXT NOT NULL DEFAULT '',
    goal TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    locale TEXT NOT NULL DEFAULT 'es',
    source TEXT NOT NULL DEFAULT 'website',
    stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new','contacted','proposal','active','completed','archived')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_leads_stage_created ON leads(stage, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email)`,
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    path TEXT NOT NULL DEFAULT '/',
    locale TEXT NOT NULL DEFAULT 'es',
    meta TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_name_created ON events(name, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    locale TEXT NOT NULL DEFAULT 'es' CHECK (locale IN ('es','en')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0,1)),
    last_login_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_email ON clients(email)`,
  `CREATE INDEX IF NOT EXISTS idx_clients_status_created ON clients(status, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS client_sessions (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_client_sessions_client ON client_sessions(client_id, expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_client_sessions_expiry ON client_sessions(expires_at)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    ip_hash TEXT NOT NULL,
    success INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_login_attempts_lookup ON login_attempts(email, ip_hash, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    title TEXT NOT NULL,
    service TEXT NOT NULL DEFAULT 'Edición de video',
    status TEXT NOT NULL DEFAULT 'briefing' CHECK (status IN ('briefing','editing','review','approved','delivered','archived')),
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    due_date TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    payment_amount_cents INTEGER NOT NULL DEFAULT 0,
    payment_currency TEXT NOT NULL DEFAULT 'USD',
    payment_status TEXT NOT NULL DEFAULT 'not_required',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_projects_client_status ON projects(client_id, status, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS project_versions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    version_number INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'review' CHECK (status IN ('review','approved','changes_requested','final')),
    r2_key TEXT NOT NULL DEFAULT '',
    original_name TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    size_bytes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_versions_project_number ON project_versions(project_id, version_number)`,
  `CREATE INDEX IF NOT EXISTS idx_versions_project_created ON project_versions(project_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS project_comments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    version_id TEXT NOT NULL DEFAULT '',
    client_id TEXT NOT NULL DEFAULT '',
    author_role TEXT NOT NULL CHECK (author_role IN ('admin','client')),
    author_name TEXT NOT NULL,
    message TEXT NOT NULL,
    time_seconds INTEGER NOT NULL DEFAULT -1,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_comments_project_created ON project_comments(project_id, created_at ASC)`,
  `CREATE TABLE IF NOT EXISTS project_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_project_events_project_created ON project_events(project_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS assistant_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_assistant_requests_ip_created ON assistant_requests(ip_hash, created_at DESC)`,
];

let initialized = false;

export async function ensureDatabase(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (initialized) return env.DB;
  await env.DB.batch(schemaStatements.map((sql) => env.DB.prepare(sql)));
  const projectColumns = await env.DB.prepare('PRAGMA table_info(projects)').all();
  const existingProjectColumns = new Set((projectColumns.results || []).map((column) => column.name));
  const projectMigrations = [];
  if (!existingProjectColumns.has('payment_amount_cents')) projectMigrations.push(env.DB.prepare("ALTER TABLE projects ADD COLUMN payment_amount_cents INTEGER NOT NULL DEFAULT 0"));
  if (!existingProjectColumns.has('payment_currency')) projectMigrations.push(env.DB.prepare("ALTER TABLE projects ADD COLUMN payment_currency TEXT NOT NULL DEFAULT 'USD'"));
  if (!existingProjectColumns.has('payment_status')) projectMigrations.push(env.DB.prepare("ALTER TABLE projects ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'not_required'"));
  if (projectMigrations.length) await env.DB.batch(projectMigrations);
  const clientColumns = await env.DB.prepare('PRAGMA table_info(clients)').all();
  const existingClientColumns = new Set((clientColumns.results || []).map((column) => column.name));
  if (!existingClientColumns.has('must_change_password')) {
    try {
      await env.DB.prepare('ALTER TABLE clients ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0,1))').run();
    } catch (error) {
      if (!/duplicate column/i.test(String(error.message || ''))) throw error;
    }
  }
  const commentColumns = await env.DB.prepare('PRAGMA table_info(project_comments)').all();
  const existingCommentColumns = new Set((commentColumns.results || []).map((column) => column.name));
  if (!existingCommentColumns.has('time_seconds')) {
    try {
      await env.DB.prepare('ALTER TABLE project_comments ADD COLUMN time_seconds INTEGER NOT NULL DEFAULT -1').run();
    } catch (error) {
      if (!/duplicate column/i.test(String(error.message || ''))) throw error;
    }
  }
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .bind('paypal_url', 'https://www.paypal.com/paypalme/MariaRios810', now),
    env.DB.prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .bind('calendly_url', '', now),
    env.DB.prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .bind('booking_url', '', now),
    env.DB.prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .bind('contact_email', 'digitalforge.team@outlook.com', now),
  ]);
  initialized = true;
  return env.DB;
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

export function cleanText(value, max = 5000) {
  return String(value ?? '').replace(/\0/g, '').trim().slice(0, max);
}

export function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function nowIso() {
  return new Date().toISOString();
}
