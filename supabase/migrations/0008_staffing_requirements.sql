-- Stage 2: what staffing is needed, per day, per role, per time interval
-- (spec §8). Deliberately NOT one row per day — each row is one interval,
-- so "10:00–14:00 needs 1 waiter, 14:00–18:00 needs 3" is two rows.
create table public.staffing_requirements (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.schedule_weeks (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  role public.staff_role not null,
  start_time time not null,
  end_time time not null,
  required_count smallint not null check (required_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staffing_requirements_time_chk check (end_time > start_time)
);
create index staffing_requirements_week_day_role_idx
  on public.staffing_requirements (week_id, day_of_week, role);

alter table public.staffing_requirements enable row level security;

create policy staffing_requirements_select_all on public.staffing_requirements
  for select to authenticated using (true);
create policy staffing_requirements_admin_write on public.staffing_requirements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Audit every requirement change regardless of how it was written (direct
-- table access via RLS, since there's no invariant here complex enough to
-- need an RPC) — a trigger guarantees this instead of relying on every
-- future code path remembering to log it by hand.
create or replace function public.audit_staffing_requirements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into audit_log (actor_type, actor_admin_id, action, entity_type, entity_id, new_value)
    values ('admin', auth.uid(), 'requirement_created', 'staffing_requirement', new.id, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into audit_log (actor_type, actor_admin_id, action, entity_type, entity_id, old_value, new_value)
    values ('admin', auth.uid(), 'requirement_updated', 'staffing_requirement', new.id, to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into audit_log (actor_type, actor_admin_id, action, entity_type, entity_id, old_value)
    values ('admin', auth.uid(), 'requirement_deleted', 'staffing_requirement', old.id, to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$;

create trigger trg_audit_staffing_requirements
  after insert or update or delete on public.staffing_requirements
  for each row execute function public.audit_staffing_requirements();

-- Default dishwasher coverage (spec §8): 10:00–22:30, 1 person, for every
-- day of the currently active week. The admin can change or delete these.
insert into public.staffing_requirements (week_id, day_of_week, role, start_time, end_time, required_count)
select w.id, d.day, 'dishwasher', '10:00', '22:30', 1
from public.schedule_weeks w
cross join generate_series(0, 6) as d(day)
where w.is_active;
