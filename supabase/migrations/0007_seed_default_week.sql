-- Stage 1: seed the single active week (spec §36 — one specific week,
-- configurable). Edit the dates below (or update the row later from the
-- Supabase SQL editor / Table editor) to match your restaurant's real
-- schedule week and timezone.
insert into public.schedule_weeks (start_date, end_date, timezone, is_active)
values ('2026-09-21', '2026-09-27', 'Europe/Moscow', true)
on conflict do nothing;
