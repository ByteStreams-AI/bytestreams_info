-- Migration: 020_reduce_cadence_floor
-- Run in the INTRANET Supabase project's SQL Editor (the one bytestreams_info reads).
-- Source: dialtone_social/migrations/020_reduce_cadence_floor.sql.
--
-- Cadence reduced 2026-10-25 to two generated posts and zero reels per week.
-- Reels remain schedulable at custom times when Steve produces one.

delete from schedule_slots where is_active is true;

insert into schedule_slots (weekday, time_local, format, pillar, note) values
  (1, '11:00', 'image', 'P1', 'Monday — operator education'),
  (4, '11:00', 'story', 'P2', 'Thursday — menu engineering, short')
on conflict do nothing;