-- Adds the DialTone.Menu setup and recurring billing lifecycle.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS setup_fee_cents             INTEGER NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS onboarded                    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS onboarded_at                 TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarded_by_email           TEXT,
  ADD COLUMN IF NOT EXISTS recurring_billing_starts_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_billing_at              TIMESTAMPTZ;

ALTER TABLE businesses
  DROP CONSTRAINT IF EXISTS businesses_onboarding_requires_verification;

ALTER TABLE businesses
  ADD CONSTRAINT businesses_onboarding_requires_verification
  CHECK (NOT onboarded OR (ein_verified AND address_verified));

COMMENT ON COLUMN businesses.setup_fee_cents IS 'Initial setup charge before tax; fixed at $100.00 for DialTone.Menu';
COMMENT ON COLUMN businesses.onboarded IS 'Admin onboarding signoff after EIN and address verification';
COMMENT ON COLUMN businesses.recurring_billing_starts_at IS 'First recurring tier charge, 30 days after onboarding signoff';
COMMENT ON COLUMN businesses.next_billing_at IS 'Next eligible recurring charge timestamp';