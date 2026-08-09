-- Adds structured address components for non-DialTone.Menu businesses.
-- DialTone.Menu addresses remain in locations.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS address_city        TEXT,
  ADD COLUMN IF NOT EXISTS address_state       VARCHAR(2),
  ADD COLUMN IF NOT EXISTS address_postal_code TEXT;

ALTER TABLE businesses
  DROP CONSTRAINT IF EXISTS businesses_address_state_format;

ALTER TABLE businesses
  ADD CONSTRAINT businesses_address_state_format
  CHECK (address_state IS NULL OR address_state ~ '^[A-Z]{2}$');

COMMENT ON COLUMN businesses.address IS 'Street address for non-DialTone.Menu businesses';
COMMENT ON COLUMN businesses.address_city IS 'City for non-DialTone.Menu businesses';
COMMENT ON COLUMN businesses.address_state IS 'Two-character US state code for non-DialTone.Menu businesses';
COMMENT ON COLUMN businesses.address_postal_code IS 'US ZIP code for non-DialTone.Menu businesses';