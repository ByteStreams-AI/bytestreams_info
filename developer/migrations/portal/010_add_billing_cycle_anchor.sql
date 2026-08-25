-- Anchors recurring DialTone.Menu billing to the day the setup fee cleared.
--
-- worker.js has written this column on setup payment and read it in the daily
-- billing cron since before migration 005, but it was never actually created:
-- the write is wrapped in .catch(() => {}) so it failed silently, and the cron's
-- `billing_cycle_start=not.is.null` filter returned a PostgREST 42703 every run.
-- Recurring billing has therefore never generated a single row.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS billing_cycle_start DATE;

COMMENT ON COLUMN businesses.billing_cycle_start IS 'Date the one-time setup fee cleared; recurring charges fall on this day of each following calendar month, clamped to the last day in months too short for it';

-- The daily cron scans for businesses due a charge today, so the anchor needs to
-- be indexable rather than a full scan of every business row.
CREATE INDEX IF NOT EXISTS businesses_billing_cycle_start_idx
  ON businesses (billing_cycle_start)
  WHERE billing_cycle_start IS NOT NULL;
