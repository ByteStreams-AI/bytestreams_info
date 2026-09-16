-- Telnyx 10DLC brand + campaign registration state for DialTone.Menu tenants.
-- One brand and one campaign PER TENANT (dialtone/developer/10dlc-campaign-registration.md).
-- The marketing DID itself lives on the DialTone side (restaurants.marketing_sms_from_number).

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS tcr_entity_type            TEXT NOT NULL DEFAULT 'PRIVATE_PROFIT',
  ADD COLUMN IF NOT EXISTS tcr_brand_id               TEXT,
  ADD COLUMN IF NOT EXISTS tcr_brand_status           TEXT,
  ADD COLUMN IF NOT EXISTS tcr_brand_registered_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tcr_campaign_id            TEXT,
  ADD COLUMN IF NOT EXISTS tcr_campaign_status        TEXT,
  ADD COLUMN IF NOT EXISTS tcr_campaign_submitted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tcr_last_checked_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tcr_last_error             TEXT;

ALTER TABLE businesses
  DROP CONSTRAINT IF EXISTS businesses_tcr_entity_type_check;
ALTER TABLE businesses
  ADD CONSTRAINT businesses_tcr_entity_type_check
  CHECK (tcr_entity_type IN ('PRIVATE_PROFIT', 'PUBLIC_PROFIT', 'NON_PROFIT'));

COMMENT ON COLUMN businesses.tcr_entity_type           IS 'TCR entity type for the brand. SOLE_PROPRIETOR is excluded on purpose: the portal requires an EIN, and sole-prop brands take a different (OTP-vetted) path.';
COMMENT ON COLUMN businesses.tcr_brand_id              IS 'Telnyx brandId (B…) once registered; registration fires at onboarding signoff';
COMMENT ON COLUMN businesses.tcr_brand_status          IS 'Telnyx identityStatus: SELF_DECLARED | VERIFIED | VETTED_VERIFIED | UNVERIFIED';
COMMENT ON COLUMN businesses.tcr_campaign_id           IS 'Telnyx campaignId (C…) once submitted from Portal Admin';
COMMENT ON COLUMN businesses.tcr_campaign_status       IS 'Telnyx campaignStatus: TCR_PENDING … MNO_PROVISIONED; refreshed on demand';
COMMENT ON COLUMN businesses.tcr_last_error            IS 'Last Telnyx refusal, verbatim, so the admin can read why rather than retry blind';
