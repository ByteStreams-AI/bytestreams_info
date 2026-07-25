-- Migration 008: Add the Reviewed status and persistent AI call scripts.
-- Run this in the Supabase SQL Editor before deploying AI call-script generation.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS call_script text;

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
      'closed_won',
      'customer',
      'closed_lost'
    )
  );