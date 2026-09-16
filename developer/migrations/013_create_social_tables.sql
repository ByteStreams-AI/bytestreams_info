-- Migration: 013_create_social_tables
-- Run in the INTRANET Supabase project's SQL Editor (the one bytestreams_info reads).
-- Copy to bytestreams_info/developer/migrations/ when run. Spec: dialtone_social PRD §9.
--
-- Tables: media_assets, social_posts, social_post_events, content_policies,
--         schedule_slots, operator_consents. Plus the private storage bucket.

-- ---------------------------------------------------------------------------
-- media_assets — every publishable asset, with the metadata to schedule it
-- without a human re-watching it. Production is not a valid source_env.
-- ---------------------------------------------------------------------------
create table if not exists media_assets (
  id                uuid primary key default gen_random_uuid(),
  storage_path      text not null,
  content_hash      text not null unique,            -- SHA-256, dedupe key
  media_type        text not null check (media_type in ('video', 'image')),
  mime_type         text not null,
  width             int  not null,
  height            int  not null,
  aspect_ratio      text not null,                   -- '9:16', '1:1', '4:5', '16:9'
  duration_seconds  numeric,
  has_audio         boolean not null default false,
  pillar            text not null check (pillar ~ '^P[0-6]$'),
  title             text not null,
  description       text,
  eligible_formats  text[] not null default '{}',
  source_env        text not null check (source_env in ('demo', 'staging', 'local', 'produced')),
  cta_verified      boolean not null default false,  -- produced video: outro carries no dead offer
  reel_subtype      text check (reel_subtype in ('workflow_walkthrough', 'call_to_ticket', 'real_surface', 'before_after', 'feature_spotlight', 'detail_shot')),
  surface           text,
  source_note       text,
  used_in_post_ids  uuid[] not null default '{}',
  is_active         boolean not null default true,
  created_by        text not null,                   -- email; who declared source_env
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger media_assets_updated_at
  before update on media_assets
  for each row execute function update_updated_at();

-- ---------------------------------------------------------------------------
-- social_posts — one row per post per platform. Supabase is the source of truth;
-- the Google Calendar mirror and the Cloudflare Workflow are projections of it.
-- ---------------------------------------------------------------------------
create table if not exists social_posts (
  id                   uuid primary key default gen_random_uuid(),
  platform             text not null default 'instagram',
  format               text not null check (format in ('reel', 'image', 'carousel', 'story')),
  pillar               text not null check (pillar ~ '^P[0-6]$'),
  origin               text not null check (origin in ('reel', 'generated')),
  status               text not null default 'draft'
                       check (status in ('draft', 'scheduled', 'publishing', 'published', 'failed', 'blocked', 'rejected', 'expired')),
  hook                 text,
  caption              text not null,
  caption_original     text,
  hashtags             text[] not null default '{}',
  media_asset_ids      uuid[] not null default '{}',  -- ordered; carousels use the order
  claims               jsonb not null default '[]',   -- [{text, source_file, source_note}]
  rationale            text,
  needs_media          boolean not null default false,
  proposal_path        text,                          -- reels/<slug>; git history is the review audit
  scheduled_for        timestamptz not null,
  schedule_version     int not null default 1,        -- bumped on every reschedule/reject; workflow id = <id>-v<version>
  publish_workflow_id  text,
  published_at         timestamptz,
  ig_container_id      text,
  ig_media_id          text,
  gcal_event_id        text,
  error                text,
  attempt_count        int not null default 0,
  generated_by_model   text,
  requires_approval    boolean not null default true, -- resolved from content_policies at creation
  approved_by          text,
  approved_at          timestamptz,
  rejection_reason     text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create unique index if not exists social_posts_platform_slot
  on social_posts (platform, scheduled_for)
  where status not in ('rejected', 'expired', 'failed');

create index if not exists social_posts_status_scheduled
  on social_posts (status, scheduled_for);

create trigger social_posts_updated_at
  before update on social_posts
  for each row execute function update_updated_at();

-- ---------------------------------------------------------------------------
-- social_post_events — append-only audit. "Who approved the post that said the
-- wrong price" must be answerable.
-- ---------------------------------------------------------------------------
create table if not exists social_post_events (
  id          bigint generated always as identity primary key,
  post_id     uuid not null references social_posts (id) on delete cascade,
  event       text not null,   -- created, approved, edited, rescheduled, rejected, publish_attempt, published, failed, blocked, expired
  actor       text not null,   -- email, or 'system'
  detail      jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists social_post_events_post on social_post_events (post_id, created_at);

-- ---------------------------------------------------------------------------
-- content_policies — per-slice approval policy. Absent row = requires approval.
-- Most-specific match wins. Flipping one is an audited act.
-- ---------------------------------------------------------------------------
create table if not exists content_policies (
  id                 uuid primary key default gen_random_uuid(),
  platform           text not null,
  pillar             text check (pillar ~ '^P[0-6]$'),   -- null = all pillars
  format             text check (format in ('reel', 'image', 'carousel', 'story')),  -- null = all formats
  requires_approval  boolean not null default true,
  changed_by         text not null,
  changed_at         timestamptz not null default now(),
  note               text
);

create unique index if not exists content_policies_slice
  on content_policies (platform, coalesce(pillar, ''), coalesce(format, ''));

-- Seed (PRD §9): reels are Steve-produced and Claude-reviewed at the proposal, so
-- they skip the queue. Everything Claude writes queues. P3 is gated in code regardless.
insert into content_policies (platform, pillar, format, requires_approval, changed_by, note) values
  ('instagram', null, 'reel',     false, 'migration', 'Reels: proposal review + Steve production is the review (PRD §3.1)'),
  ('instagram', null, 'story',    true,  'migration', 'Claude-created; Steve reviews'),
  ('instagram', null, 'image',    true,  'migration', 'Claude-created; Steve reviews'),
  ('instagram', null, 'carousel', true,  'migration', 'Claude-created; Steve reviews'),
  ('instagram', 'P3', null,       true,  'migration', 'Cost/pricing claims never auto-publish; also gated in code')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- schedule_slots — the recurring template the planner fills. Times are
-- America/Chicago (national audience; Central is the compromise, not a preference).
-- Reel slots are filled by ingest, not the planner; empty ones show as needs_reel.
-- ---------------------------------------------------------------------------
create table if not exists schedule_slots (
  id          uuid primary key default gen_random_uuid(),
  weekday     int  not null check (weekday between 0 and 6),   -- 0 = Sunday
  time_local  time not null,
  format      text not null check (format in ('reel', 'image', 'carousel', 'story')),
  pillar      text check (pillar ~ '^P[0-6]$'),                -- null = planner chooses
  note        text,
  is_active   boolean not null default true
);

insert into schedule_slots (weekday, time_local, format, pillar, note) values
  (1, '11:00', 'image',    'P1', 'Operator education post'),
  (2, '16:00', 'reel',     null, 'Reel slot — Steve''s next reel'),
  (3, '11:00', 'story',    'P1', 'Operator education story'),
  (4, '17:00', 'reel',     null, 'Reel slot — P6 when consented'),
  (5, '11:00', 'story',    null, 'P2 / P3 alternating'),
  (6, '10:00', 'carousel', null, 'P0 → P2 → P3 rotating')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- operator_consents — written consent per operator PER TIER. T1 (relationship)
-- and T2 (personal) are independent. Any named person is T2. PRD v1 §6.7.
-- ---------------------------------------------------------------------------
create table if not exists operator_consents (
  id                   uuid primary key default gen_random_uuid(),
  operator_name        text not null,
  tenant_slug          text,
  tier                 text not null check (tier in ('T1_relationship', 'T2_personal')),
  consent_scope        text[] not null,
  allows_business_name boolean not null,
  allows_owner_names   boolean not null default false,
  granted_at           timestamptz not null,
  granted_by           text not null,
  document_path        text not null,
  revoked_at           timestamptz,
  notes                text,
  created_at           timestamptz not null default now(),
  unique (operator_name, tier)
);

-- ---------------------------------------------------------------------------
-- Storage: PRIVATE bucket. Meta fetches media through 2-hour signed URLs minted
-- inside the publish step. No public read policy, on purpose.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'social-media-assets', 'social-media-assets', false,
  314572800,   -- 300 MB, Meta's Reels ceiling. Check the project-level upload cap too (50 MB on Free).
  array['video/mp4', 'video/quicktime', 'image/png', 'image/jpeg']
)
on conflict (id) do nothing;
