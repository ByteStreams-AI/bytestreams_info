-- The LIVE tenant, recorded on the business row.
--
-- The portal creates a tenant in the tenants' project (DialTone staging). The
-- tenant that serves guests is its PROD clone, made by
-- dialtone/scripts/clone-tenant-to-prod.sh — a different project for the
-- evidence bucket and, when a tenant was re-created rather than cloned, a
-- different restaurant id and slug. Until now nothing on the row said which
-- prod tenant a business became, so the 10DLC campaign modal prefilled the
-- staging paths, which never resolve, and the admin had to know the prod slug
-- and restaurant id from elsewhere.
--
-- Written by the clone script at clone time (same id and slug as staging, by
-- construction of that script), or by an admin in the edit modal when the
-- live tenant was made some other way. `prod_recorded_by` says which.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS prod_restaurant_id  UUID,
  ADD COLUMN IF NOT EXISTS prod_slug           TEXT,
  ADD COLUMN IF NOT EXISTS prod_recorded_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prod_recorded_by    TEXT;

ALTER TABLE businesses
  DROP CONSTRAINT IF EXISTS businesses_prod_tenant_pair_chk;
ALTER TABLE businesses
  ADD CONSTRAINT businesses_prod_tenant_pair_chk
  CHECK ((prod_restaurant_id IS NULL) = (prod_slug IS NULL));

COMMENT ON COLUMN businesses.prod_restaurant_id IS 'restaurants.id of the LIVE tenant in the DialTone prod project; the evidence folder is keyed on it';
COMMENT ON COLUMN businesses.prod_slug          IS 'restaurants.slug of the LIVE tenant; the branded host is https://<prod_slug>.m.dialtone.menu';
COMMENT ON COLUMN businesses.prod_recorded_at   IS 'When the live tenant was recorded';
COMMENT ON COLUMN businesses.prod_recorded_by   IS 'clone-tenant-to-prod.sh, or the admin email that set it by hand';
