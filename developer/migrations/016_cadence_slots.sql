-- Migration: 016_cadence_slots
-- Run in the INTRANET Supabase project's SQL Editor (the one bytestreams_info reads).
-- Copy to bytestreams_info/developer/migrations/ when run. Spec: dialtone_social PRD §3.2.
--
-- Cadence raised 2026-09-22: at least one generated post a day and two reels a week,
-- with a ceiling of three a day and three reels. The 013 seed was six slots a week —
-- four generated, two reels — which was the old ~2-3/week target and cannot express a
-- daily floor.
--
-- These slots are the FLOOR, not the plan. They are what `/social` offers as open times;
-- anything above one a day goes in on a custom time, up to the 21-in-7-days ceiling that
-- requestDraft enforces. Nothing here manufactures a post.
--
-- Pillar priority is P1 > P2 > P3 > P0 (PRD §3.2). P1 carries the majority because it is
-- the only pillar with unbounded material. P3 is bounded by facts.ts and P0 is one
-- message, so both sit at the floor by design rather than scaling with volume.
--
-- Weekday is 0 = Sunday, matching 013. Times are local (America/Chicago).

delete from schedule_slots where is_active is true;

insert into schedule_slots (weekday, time_local, format, pillar, note) values
  -- One generated post every day: the floor.
  (0, '10:00', 'carousel', 'P2', 'Sunday — menu engineering, the long read'),
  (1, '11:00', 'image',    'P1', 'Monday — operator education'),
  (2, '11:00', 'story',    'P1', 'Tuesday — operator education, short'),
  (3, '11:00', 'image',    'P1', 'Wednesday — operator education'),
  (4, '11:00', 'story',    'P2', 'Thursday — menu engineering, short'),
  (5, '11:00', 'image',    'P1', 'Friday — operator education; the Friday 7pm rush is the subject that writes itself'),
  (6, '10:00', 'carousel', 'P3', 'Saturday — cost evaluation. Never auto-publishes; every claim cited'),
  -- Two reel slots: the floor. A third is a custom time when Steve has produced one.
  (2, '16:00', 'reel', null, 'Reel — product proof (P4) or a brand spot (P5)'),
  (4, '17:00', 'reel', null, 'Reel — P6 real operators when consent covers it, else P4')
on conflict do nothing;

-- P0 is absent on purpose. It is front-loaded at launch on custom times and then sits at
-- roughly one a week; a standing weekly slot would turn one message into a loop.
