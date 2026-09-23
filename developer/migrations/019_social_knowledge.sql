-- Migration: 019_social_knowledge
-- Run in the INTRANET Supabase project's SQL Editor (the one bytestreams_info reads).
-- Copy to bytestreams_info/developer/migrations/ when run. Spec: dialtone_social PRD §4.2.
--
-- The knowledge base, editable without a deploy.
--
-- It began as knowledge/*.md compiled into the Worker bundle, which is right while an
-- engineer is the one writing it and wrong the moment somebody else owns the account:
-- editing it meant a text editor, a build script, a test run and a git push. Adding
-- material is the task the next person will do most often, so it moves to a table with a
-- textarea in /social.
--
-- The markdown does NOT go away. It seeds this table and remains the fallback the Worker
-- uses when a pillar has no row, so an empty or unreachable table degrades to the corpus
-- that shipped rather than to no knowledge at all.
--
-- This is NOT the fact sheet. facts.ts holds claims that must be cited and lives in code,
-- reviewed in a pull request, changed in the same PR as pricing.html. Knowledge is
-- material to think with and is never citable. The guardrail that keeps them apart — no
-- figures, no vendor names, no banned words — runs on save here, because there is no CI
-- between an operator typing and the model reading it.

create table if not exists social_knowledge (
  pillar      text primary key check (pillar ~ '^P[0-3]$'),   -- generated pillars only
  body        text not null,
  updated_by  text not null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create trigger social_knowledge_updated_at
  before update on social_knowledge
  for each row execute function update_updated_at();

alter table social_knowledge enable row level security;
revoke all on social_knowledge from anon, authenticated;

comment on table social_knowledge is
  'Domain material the generator thinks WITH, one row per generated pillar. Never citable — every pricing, tier, feature or savings claim still comes from worker/src/facts.ts with an id. Seeded from knowledge/*.md, which stays as the fallback when a pillar has no row.';
