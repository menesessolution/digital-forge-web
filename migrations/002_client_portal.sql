CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL,
  password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'es' CHECK (locale IN ('es','en')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  last_login_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_status_created ON clients(status, created_at DESC);
CREATE TABLE IF NOT EXISTS client_sessions (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_client_sessions_client ON client_sessions(client_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_client_sessions_expiry ON client_sessions(expires_at);
CREATE TABLE IF NOT EXISTS login_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, ip_hash TEXT NOT NULL, success INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_login_attempts_lookup ON login_attempts(email, ip_hash, created_at DESC);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, title TEXT NOT NULL,
  service TEXT NOT NULL DEFAULT 'Edición de video',
  status TEXT NOT NULL DEFAULT 'briefing' CHECK (status IN ('briefing','editing','review','approved','delivered','archived')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  due_date TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_client_status ON projects(client_id, status, updated_at DESC);
CREATE TABLE IF NOT EXISTS project_versions (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, version_number INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'review' CHECK (status IN ('review','approved','changes_requested','final')),
  r2_key TEXT NOT NULL DEFAULT '', original_name TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream', size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_versions_project_number ON project_versions(project_id, version_number);
CREATE INDEX IF NOT EXISTS idx_versions_project_created ON project_versions(project_id, created_at DESC);
CREATE TABLE IF NOT EXISTS project_comments (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, version_id TEXT NOT NULL DEFAULT '', client_id TEXT NOT NULL DEFAULT '',
  author_role TEXT NOT NULL CHECK (author_role IN ('admin','client')), author_name TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_project_created ON project_comments(project_id, created_at ASC);
CREATE TABLE IF NOT EXISTS project_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL, kind TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_events_project_created ON project_events(project_id, created_at DESC);
PRAGMA optimize;
