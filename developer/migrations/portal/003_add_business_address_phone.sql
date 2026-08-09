-- Adds address and phone to businesses for non-DM product types (Other, Med).
-- DM businesses store address in the locations table via dialtone_location_id.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS phone   TEXT;
