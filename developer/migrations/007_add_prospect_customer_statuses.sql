-- Migration 007: Add 'prospect' and 'customer' to the lead status constraint.
-- Run this in the Supabase SQL Editor before using these statuses in production.

ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE leads
  ADD CONSTRAINT leads_status_check CHECK (
    status IN (
      'new',
      'researched',
      'prospect',
      'contacted',
      'followup_required',
      'demo_scheduled',
      'closed_won',
      'customer',
      'closed_lost'
    )
  );