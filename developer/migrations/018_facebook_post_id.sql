-- Migration: 018_facebook_post_id
-- Run in the INTRANET Supabase project's SQL Editor (the one bytestreams_info reads).
-- Copy to bytestreams_info/developer/migrations/ when run. Spec: dialtone_social PRD §5, §9.
--
-- Facebook stops being invisible.
--
-- v1 assumed Instagram's "Sharing across profiles" would carry API-published content to
-- the Page, so there was deliberately no Facebook record at all (PRD §5: "auto-share
-- produces no media id and no failure signal"). That assumption failed on 2026-09-23:
-- sharing is routed to the operator's personal profile with the destination not editable,
-- and three successful Instagram publishes produced zero Facebook posts anywhere. The
-- Worker now publishes to the Page explicitly, which means there IS an id to keep.
--
-- fb_error is separate from `error` on purpose. `error` means the post failed. A post that
-- reached Instagram and not Facebook has NOT failed — it is published, with one channel
-- short — and overloading `error` would flip it to `failed` and invite a retry that
-- republishes it to Instagram.

alter table social_posts
  add column if not exists fb_post_id text,
  add column if not exists fb_error   text;

comment on column social_posts.fb_post_id is
  'Facebook Page post id from the explicit publish. Null means not attempted, not yet published, or a format with no Facebook path.';
comment on column social_posts.fb_error is
  'Why the Facebook publish failed, when Instagram succeeded. The post is still `published`: Instagram is the primary channel and a Facebook failure never marks the post failed.';
