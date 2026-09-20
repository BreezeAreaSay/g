-- Stage 5: actual clock-in/clock-out (spec §21-23). One row per shift
-- (not per employee-day), since a double shift has two independent
-- attendance records.
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null unique references public.shifts (id) on delete cascade,
  clock_in_at timestamptz,
  clock_in_source text check (clock_in_source in ('employee', 'admin')),
  clock_out_at timestamptz,
  clock_out_source text check (clock_out_source in ('employee', 'admin')),
  corrected_by uuid references auth.users (id),
  corrected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_order_chk check (clock_out_at is null or clock_in_at is null or clock_out_at >= clock_in_at)
);

alter table public.attendance enable row level security;

create policy attendance_select on public.attendance
  for select to authenticated using (
    public.is_admin()
    or exists (select 1 from public.shifts s where s.id = shift_id and s.employee_id = public.current_employee_id())
  );
create policy attendance_admin_write on public.attendance
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- Employee writes only through clock_in()/clock_out() below (security
-- definer) so every change is validated and notified consistently.

alter publication supabase_realtime add table public.attendance;
