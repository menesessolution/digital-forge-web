CREATE TABLE IF NOT EXISTS client_support_messages (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('client','admin')),
  sender_id TEXT NOT NULL DEFAULT '',
  author_label TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  read_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_support_client_created
  ON client_support_messages(client_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_client_support_unread
  ON client_support_messages(sender_role, read_at, created_at DESC);
