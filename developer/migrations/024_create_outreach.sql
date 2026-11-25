-- Automated DialTone.Med email outreach, sent from a connected Gmail account.
-- Run this in the hltmzafywzqajjzjpqva Supabase SQL Editor before deploying the code that reads it.
--
-- outreach_sequences    one row per lead that has entered the sequence, and why it stopped
-- outreach_messages     every planned, approved, sent or skipped email (one per lead per step)
-- outreach_suppressions addresses that must never be emailed again (opt-outs, bounces)
-- outreach_plan_days    the days the daily planner has already run

CREATE TABLE IF NOT EXISTS outreach_sequences (
    lead_id UUID PRIMARY KEY REFERENCES leads(lead_id) ON DELETE CASCADE,
    to_email TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'active'
        CHECK (state IN ('active', 'replied', 'bounced', 'opted_out', 'completed', 'stopped')),
    gmail_thread_id TEXT,
    last_rfc_message_id TEXT,
    first_subject TEXT,
    last_sent_at TIMESTAMPTZ,
    stopped_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outreach_sequences_state_idx ON outreach_sequences (state);

CREATE TABLE IF NOT EXISTS outreach_messages (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(lead_id) ON DELETE CASCADE,
    step SMALLINT NOT NULL CHECK (step BETWEEN 1 AND 3),
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'sending', 'sent', 'skipped', 'failed')),
    planned_for DATE NOT NULL,
    send_after TIMESTAMPTZ,
    approved_by_email TEXT,
    approved_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    gmail_message_id TEXT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (lead_id, step)
);

CREATE INDEX IF NOT EXISTS outreach_messages_status_idx ON outreach_messages (status, send_after);
CREATE INDEX IF NOT EXISTS outreach_messages_planned_idx ON outreach_messages (planned_for);

CREATE TABLE IF NOT EXISTS outreach_suppressions (
    email TEXT PRIMARY KEY CHECK (email = lower(email)),
    reason TEXT NOT NULL CHECK (reason IN ('opted_out', 'bounced', 'manual')),
    created_by_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per local day the planner has run, so the 15-minute cron plans once a day.
CREATE TABLE IF NOT EXISTS outreach_plan_days (
    day DATE PRIMARY KEY,
    planned_count INT NOT NULL,
    planned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS outreach_sequences_updated_at ON outreach_sequences;
CREATE TRIGGER outreach_sequences_updated_at
    BEFORE UPDATE ON outreach_sequences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE outreach_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_plan_days ENABLE ROW LEVEL SECURITY;
