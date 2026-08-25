ALTER TABLE project_comments
ADD COLUMN time_seconds INTEGER NOT NULL DEFAULT -1;

PRAGMA optimize;
