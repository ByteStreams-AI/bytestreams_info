-- Portal Supabase migration: add portal-specific fields to businesses table
-- Run against the PORTAL Supabase project (not the CRM database)
-- Applied: 2026-08-08
--
-- Note: address, lat/lng, phone, tier, restaurant_name go to restaurants + locations tables.
-- Only portal-specific flags that have no home elsewhere belong here.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS address_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_food_truck        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS billing_address_same BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS service_provided     TEXT;

COMMENT ON COLUMN businesses.address_verified     IS 'PostGrid address verification result';
COMMENT ON COLUMN businesses.is_food_truck        IS 'DialTone.Menu: food truck flag';
COMMENT ON COLUMN businesses.billing_address_same IS 'Use location address as payment processing billing address';
COMMENT ON COLUMN businesses.service_provided     IS 'Description of service for Other product type (min 25 chars)';
