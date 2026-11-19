-- Runtime limits / OAuth token store + upload timestamp (daily upload cap counts by upload time)
CREATE TABLE IF NOT EXISTS settings (
  key   VARCHAR(60) PRIMARY KEY,
  value TEXT
);
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMP;
