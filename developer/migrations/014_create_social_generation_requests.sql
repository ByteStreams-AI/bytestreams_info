-- Migration: 014_create_social_generation_requests
-- Run in the INTRANET Supabase project's SQL Editor (the one bytestreams_info reads).
-- Copy to bytestreams_info/developer/migrations/ when run. Spec: dialtone_social PRD §4.2, §9.
--
-- The intranet queue and the Sunday planner never call Claude or Browser Rendering
-- themselves: they write a request here and the Worker's 15-minute reconcile cron
-- drains it (one owner for the generator, as for workflow instances). A request
-- produces exactly one social_posts draft, or an error, never a partial row.

create table if not exists social_generation_requests (
  id              uuid primary key default gen_random_uuid(),
  platform        text not null default 'instagram',
  format          text not null check (format in ('image', 'carousel', 'story')),  -- never 'reel' (PRD §3.1)
  pillar          text not null check (pillar ~ '^P[0-3]$'),                      -- generated pillars only
  scheduled_for   timestamptz not null,
  status          text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  requested_by    text not null,                   -- email, or 'planner'
  brief           text,                            -- optional steer from the requester
  avoid           text,                            -- rejection reason from the draft this replaces (negative example)
  replaces_post_id uuid references social_posts (id) on delete set null,
  post_id         uuid references social_posts (id) on delete set null,
  error           text,
  attempts        int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists social_generation_requests_pending
  on social_generation_requests (created_at)
  where status = 'pending';

create trigger social_generation_requests_updated_at
  before update on social_generation_requests
  for each row execute function update_updated_at();
