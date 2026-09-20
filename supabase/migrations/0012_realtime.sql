-- Stage 2: let the frontend subscribe to live changes on the tables that
-- benefit from it (so "who else is working" and coverage update instantly
-- for everyone looking at the schedule, not just after a manual refresh).
-- Supabase Realtime's Postgres Changes still enforce each table's RLS —
-- this does not widen access on its own.
alter publication supabase_realtime add table public.shifts;
alter publication supabase_realtime add table public.staffing_requirements;
