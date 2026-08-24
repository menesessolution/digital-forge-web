CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('portfolio','case_study','testimonial','pricing','blog')),
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  title_es TEXT NOT NULL DEFAULT '', title_en TEXT NOT NULL DEFAULT '',
  excerpt_es TEXT NOT NULL DEFAULT '', excerpt_en TEXT NOT NULL DEFAULT '',
  body_es TEXT NOT NULL DEFAULT '', body_en TEXT NOT NULL DEFAULT '',
  media_url TEXT NOT NULL DEFAULT '', cta_url TEXT NOT NULL DEFAULT '',
  price_es TEXT NOT NULL DEFAULT '', price_en TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '', role_es TEXT NOT NULL DEFAULT '', role_en TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_type_slug ON content_items(type, slug);
CREATE INDEX IF NOT EXISTS idx_content_public ON content_items(status, type, sort_order);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL, project_type TEXT NOT NULL DEFAULT '', goal TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '', locale TEXT NOT NULL DEFAULT 'es', source TEXT NOT NULL DEFAULT 'website',
  stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new','contacted','proposal','active','completed','archived')),
  notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_stage_created ON leads(stage, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, path TEXT NOT NULL DEFAULT '/',
  locale TEXT NOT NULL DEFAULT 'es', meta TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_name_created ON events(name, created_at DESC);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL);
PRAGMA optimize;
