-- Adds a LinkedIn profile or company page URL to every lead.
-- Run this in the hltmzafywzqajjzjpqva Supabase SQL Editor before deploying
-- the code that reads it.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
