-- Stage 2: actual planned shifts. `source` tracks how the row came to
-- exist, because "my own weekly availability" (source='self') is edited
-- through one simple tap-a-day-pick-a-time flow (spec §6) and must stay a
-- single row per employee per day, while rows created later by an admin
-- edit (Stage 5) or by accepting a shortage request (Stage 3) are allowed
-- to add a SECOND shift the same day (e.g. accepting an extra dishwasher
-- shift on top of an already-declared waiter shift — a real double shift).
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.schedule_weeks (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  role public.staff_role not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  source text not null check (source in ('self', 'admin', 'shortage_response')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shifts_time_chk check (end_time > start_time)
);
create index shifts_week_day_role_idx on public.shifts (week_id, day_of_week, role);
create index shifts_employee_idx on public.shifts (employee_id);
-- At most one SELF-entered shift per employee per day — this is what
-- save_my_shift()/delete_my_shift() upsert against (spec §6's "one range
-- per day" model). Admin-added or shortage-accepted rows are exempt.
create unique index shifts_one_self_per_day
  on public.shifts (employee_id, week_id, day_of_week)
  where source = 'self';

alter table public.shifts enable row level security;

-- Reading shifts (employee_id, role, times — no names, no phones) is safe
-- for anyone signed in; the shift_schedule view (0010) is what actually
-- resolves employee_id -> a display name for the shared weekly view.
create policy shifts_select_all on public.shifts
  for select to authenticated using (true);
create policy shifts_admin_write on public.shifts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- No insert/update/delete policy for a plain employee: all self-service
-- shift edits go through save_my_shift()/delete_my_shift() (security
-- definer RPCs below), so every change gets validated, audit-logged and
-- triggers the admin notification in one place — spec §6/§33.
