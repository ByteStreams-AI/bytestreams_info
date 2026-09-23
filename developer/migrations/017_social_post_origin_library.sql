-- Migration: 017_social_post_origin_library
-- Run in the INTRANET Supabase project's SQL Editor (the one bytestreams_info reads).
-- Copy to bytestreams_info/developer/migrations/ when run. Spec: dialtone_social PRD §9.
--
-- A third origin, for a post assembled by hand from library assets — the carousels in
-- `carousels/<slug>/`, and any future post built from files rather than written by Claude.
--
-- Neither existing value fits. `reel` is plainly wrong. `generated` is a lie about
-- provenance, and it has a consequence beyond tidiness: /social offers **Regenerate** on a
-- generated draft, and `regeneratePost` asks the Worker for a fresh Claude draft for the
-- slot. Press that on a hand-built carousel and the slides are replaced by a rendered
-- text card. The enum is what keeps that button off the post.
--
-- A `library` post still COUNTS as a post: it takes a slot, it goes against the 21-in-7
-- ceiling (PRD §3.2), and it counts toward the daily floor in the digest. Every query
-- that filters `origin = 'generated'` for those purposes now takes both.

alter table social_posts drop constraint if exists social_posts_origin_check;

alter table social_posts
  add constraint social_posts_origin_check
  check (origin in ('reel', 'generated', 'library'));

comment on column social_posts.origin is
  'reel = produced by Steve and ingested from reels/<slug>. generated = written by Claude through the request queue. library = assembled by hand from existing assets (carousels/<slug>); counts as a post for cadence, but has no Claude draft behind it so it can never be regenerated.';
