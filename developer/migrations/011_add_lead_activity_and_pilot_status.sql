-- Adds manual outreach activity tracking and the Pilot pipeline status.
-- Run this in the hltmzafywzqajjzjpqva Supabase SQL Editor.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS emailed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS called BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE leads
  ADD CONSTRAINT leads_status_check CHECK (
    status IN (
      'new',
      'researched',
      'reviewed',
      'prospect',
      'contacted',
      'followup_required',
      'demo_scheduled',
      'pilot',
      'closed_won',
      'customer',
      'closed_lost'
    )
  );