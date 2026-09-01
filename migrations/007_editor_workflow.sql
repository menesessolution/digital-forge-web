CREATE TABLE IF NOT EXISTS editors (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, alias TEXT NOT NULL DEFAULT 'Equipo de edición', email TEXT NOT NULL,
  password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0,1)),
  last_login_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_editors_email ON editors(email);
CREATE INDEX IF NOT EXISTS idx_editors_status_created ON editors(status, created_at DESC);

CREATE TABLE IF NOT EXISTS editor_sessions (
  id TEXT PRIMARY KEY, editor_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_editor_sessions_editor ON editor_sessions(editor_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_editor_sessions_expiry ON editor_sessions(expires_at);

CREATE TABLE IF NOT EXISTS editor_login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, ip_hash TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_editor_login_attempts_lookup ON editor_login_attempts(email, ip_hash, created_at DESC);

ALTER TABLE projects ADD COLUMN editor_id TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN public_code TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN editor_title TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN editor_brief TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_projects_editor_status ON projects(editor_id, status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_public_code ON projects(public_code) WHERE public_code!='';

CREATE TABLE IF NOT EXISTS project_messages (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, version_id TEXT NOT NULL DEFAULT '',
  sender_role TEXT NOT NULL CHECK (sender_role IN ('admin','client','editor')),
  sender_id TEXT NOT NULL DEFAULT '', author_label TEXT NOT NULL DEFAULT '', message TEXT NOT NULL,
  time_seconds INTEGER NOT NULL DEFAULT -1,
  moderation_status TEXT NOT NULL DEFAULT 'allowed' CHECK (moderation_status IN ('allowed','hidden')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_messages_project_created ON project_messages(project_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_project_messages_sender ON project_messages(sender_role, sender_id, created_at DESC);

CREATE TABLE IF NOT EXISTS project_notifications (
  id TEXT PRIMARY KEY, recipient_role TEXT NOT NULL CHECK (recipient_role IN ('admin','client','editor')),
  recipient_id TEXT NOT NULL DEFAULT '', project_id TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL,
  title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', read_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON project_notifications(recipient_role, recipient_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_project ON project_notifications(project_id, created_at DESC);
