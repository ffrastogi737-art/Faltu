-- Uploaded files and server keys live in PostgreSQL, so hosts without a persistent disk
-- (e.g. Render free) keep product photos and push keys across restarts and redeploys.
CREATE TABLE media (
  path         text PRIMARY KEY,          -- served at /uploads/<path>
  content_type text NOT NULL,
  data         bytea NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE server_keys (
  name  text PRIMARY KEY,
  value jsonb NOT NULL
);
