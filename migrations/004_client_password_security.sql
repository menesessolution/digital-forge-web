ALTER TABLE clients
ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1
CHECK (must_change_password IN (0,1));

PRAGMA optimize;
