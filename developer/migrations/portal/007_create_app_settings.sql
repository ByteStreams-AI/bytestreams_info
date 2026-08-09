-- Portal Supabase migration: create app_settings table for admin-configurable settings
-- Run against the PORTAL Supabase project (not the CRM database)
-- Applied: 2026-08-09

CREATE TABLE IF NOT EXISTS app_settings (
  key          TEXT PRIMARY KEY,
  value        TEXT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   TEXT
);

COMMENT ON TABLE app_settings IS 'Admin-configurable application settings';
COMMENT ON COLUMN app_settings.key IS 'Unique setting identifier';
COMMENT ON COLUMN app_settings.value IS 'Setting value (stored as text, cast as needed)';
COMMENT ON COLUMN app_settings.updated_by IS 'Email of admin who last updated this setting';

-- Insert default for tax assessment
INSERT INTO app_settings (key, value, updated_at)
VALUES ('enable_tax_assessment', 'true', NOW())
ON CONFLICT (key) DO NOTHING;
