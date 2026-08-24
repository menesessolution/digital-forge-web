ALTER TABLE projects ADD COLUMN payment_amount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN payment_currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE projects ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'not_required';

INSERT OR IGNORE INTO settings (key, value, updated_at)
VALUES ('booking_url', '', datetime('now'));

CREATE TABLE IF NOT EXISTS assistant_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assistant_requests_ip_created
ON assistant_requests(ip_hash, created_at DESC);

PRAGMA optimize;
