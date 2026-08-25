-- Records the full payment lifecycle, not just the successful path.
--
-- Before this, billing_schedule only ever moved pending -> paid. Once real money
-- moves, failures, refunds, and disputes have to be reconcilable too, and the
-- Stripe Tax calculation has to be committed as a transaction so collected tax
-- is actually reported for filing.

ALTER TABLE billing_schedule
  ADD COLUMN IF NOT EXISTS stripe_tax_transaction_id  TEXT,
  ADD COLUMN IF NOT EXISTS last_payment_error         TEXT,
  ADD COLUMN IF NOT EXISTS last_payment_failed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_cents             INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disputed_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispute_reason             TEXT;

COMMENT ON COLUMN billing_schedule.stripe_tax_transaction_id IS 'Stripe Tax Transaction committed from stripe_tax_calculation_id after payment cleared; NULL means the sale is not yet in Stripe Tax reporting';
COMMENT ON COLUMN billing_schedule.last_payment_error IS 'Message from the most recent failed payment attempt; the bill stays payable';
COMMENT ON COLUMN billing_schedule.refunded_cents IS 'Cumulative amount refunded in USD cents, as reported by Stripe';
COMMENT ON COLUMN billing_schedule.disputed_at IS 'Time a chargeback was opened against this bill';

-- Resolving a webhook for a charge or dispute requires looking a bill up by its
-- PaymentIntent, which is otherwise an unindexed full scan.
CREATE INDEX IF NOT EXISTS billing_schedule_payment_intent_idx
  ON billing_schedule (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
