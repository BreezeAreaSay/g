-- Stage 2: the shared "who works when" view (spec §19) — joins shifts to
-- the phone-free roster (never to the `employees` table directly), so it
-- is structurally impossible for this view to leak a phone number no
-- matter how employees RLS evolves later.
create view public.shift_schedule as
  select
    s.id,
    s.week_id,
    s.employee_id,
    er.name as employee_name,
    s.role,
    s.day_of_week,
    s.start_time,
    s.end_time,
    s.source,
    s.created_at,
    s.updated_at
  from public.shifts s
  join public.employee_roster er on er.id = s.employee_id;

-- Same reasoning as employee_roster (0005_views.sql): revoke the
-- platform's default anon grant explicitly, keep it authenticated-only.
revoke all on public.shift_schedule from anon, public;
grant select on public.shift_schedule to authenticated;
