-- Migration: 012_create_google_calendar_tokens
-- Run in Supabase SQL Editor
-- Stores per-user Google OAuth tokens so the intranet calendar can read/write
-- each user's real Google Calendar (primary calendar) and send real invites.

create table if not exists google_calendar_tokens (
  user_email    text primary key,  -- user email from CF Access JWT
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  scope         text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger google_calendar_tokens_updated_at
  before update on google_calendar_tokens
  for each row execute function update_updated_at();

-- NOTE: run after confirming the Google Calendar migration succeeded and the
-- app no longer reads/writes the old `events` table:
-- drop table if exists events;
