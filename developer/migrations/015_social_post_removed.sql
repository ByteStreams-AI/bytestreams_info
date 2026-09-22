-- Migration: 015_social_post_removed
-- Run in the INTRANET Supabase project's SQL Editor (the one bytestreams_info reads).
-- Copy to bytestreams_info/developer/migrations/ when run. Spec: dialtone_social PRD §9.
--
-- Taking a post out of the queue, without destroying the record of it.
--
-- Two cases the UI labels differently but stores identically:
--   * a PUBLISHED post the operator deleted from Instagram by hand. Meta's content
--     publishing API has no delete, so the intranet can only record what happened
--     outside it — a button that claimed to delete from the account would be a lie.
--   * a post that never reached Instagram (draft, rejected, expired, failed, blocked)
--     and is just clutter in the queue.
--
-- Deliberately NOT a hard delete: social_post_events.post_id is ON DELETE CASCADE, so
-- removing the row would destroy every event attached to it — the publish attempts, the
-- failure, the reason it was rejected. That log is what makes a failure diagnosable
-- (proven on 2026-09-22, when it was the only way to find a silently stalled post).
--
-- Deliberately NOT a new `status` value either: status records what the PIPELINE did.
-- A post that published, published. What happened to it afterwards is a separate fact.

alter table social_posts
  add column if not exists removed_at     timestamptz,
  add column if not exists removed_reason text;

comment on column social_posts.removed_at is
  'When the post was taken out of the queue. For a published post this means it was deleted from the account by hand — Meta has no delete API. Null means still live in the queue.';

-- Every list in /social filters on this, so it is the hot path.
create index if not exists social_posts_not_removed
  on social_posts (status, scheduled_for)
  where removed_at is null;
