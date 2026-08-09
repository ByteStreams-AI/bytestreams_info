-- Stores Stripe Tax assessments for setup and recurring DialTone.Menu charges.

ALTER TABLE billing_schedule
  ADD COLUMN IF NOT EXISTS subtotal_cents                  INTEGER,
  ADD COLUMN IF NOT EXISTS tax_cents                       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_tax_calculation_id       TEXT,
  ADD COLUMN IF NOT EXISTS stripe_tax_breakdown            JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tax_assessed_at                  TIMESTAMPTZ;

UPDATE billing_schedule
SET subtotal_cents = amount_cents
WHERE subtotal_cents IS NULL;

ALTER TABLE billing_schedule
  ALTER COLUMN subtotal_cents SET NOT NULL;

COMMENT ON COLUMN billing_schedule.subtotal_cents IS 'Charge before tax in USD cents';
COMMENT ON COLUMN billing_schedule.tax_cents IS 'Stripe Tax exclusive tax amount in USD cents';
COMMENT ON COLUMN billing_schedule.amount_cents IS 'Total charge including assessed tax in USD cents';
COMMENT ON COLUMN billing_schedule.stripe_tax_calculation_id IS 'Stripe Tax Calculation used for this billing row';
COMMENT ON COLUMN billing_schedule.stripe_tax_breakdown IS 'Stripe jurisdiction and rate breakdown returned during assessment';
COMMENT ON COLUMN billing_schedule.tax_assessed_at IS 'Time Stripe Tax assessed this charge';