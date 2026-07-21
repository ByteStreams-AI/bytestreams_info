-- Migration 006: Add 'researched' status to leads_status_check constraint
-- Run this in the Supabase SQL Editor before deploying the CRM 'Researched' feature.

ALTER TABLE leads
  DROP CONSTRAINT leads_status_check;

ALTER TABLE leads
  ADD CONSTRAINT leads_status_check CHECK (
    status IN (
      'new',
      'researched',
      'contacted',
      'followup_required',
      'demo_scheduled',
      'closed_won',
      'closed_lost'
    )
  );
