-- Migration: 005_create_events
-- Run in Supabase SQL Editor
-- Creates the events table for the intranet calendar feature

create table if not exists events (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  start_at      timestamptz not null,
  end_at        timestamptz not null,
  all_day       boolean not null default false,
  color         text,           -- optional hex color for the event block
  created_by    text not null,  -- user email from CF Access JWT
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Auto-update updated_at on row change
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger events_updated_at
  before update on events
  for each row execute function update_updated_at();

-- Index for date-range queries (the most common access pattern)
create index if not exists events_start_at_idx on events (start_at);
