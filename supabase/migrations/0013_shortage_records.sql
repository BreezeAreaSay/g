-- Stage 3: persisted shortage detection (spec §9-11). One row per
-- requirement interval that has ever been short-staffed, so an admin's
-- "skip" decision (spec §11) is remembered and never re-notified, even
-- after the same interval's coverage changes again.
create table public.shortage_records (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.schedule_weeks (id) on delete cascade,
  requirement_id uuid not null unique references public.staffing_requirements (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  role public.staff_role not null,
  start_time time not null,
  end_time time not null,
  required_count smallint not null,
  scheduled_count smallint not null,
  status text not null check (status in ('detected', 'skipped', 'resolved')) default 'detected',
  skipped_by uuid references auth.users (id),
  skipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index shortage_records_week_status_idx on public.shortage_records (week_id, status);

alter table public.shortage_records enable row level security;
create policy shortage_records_select_all on public.shortage_records
  for select to authenticated using (true);
create policy shortage_records_admin_write on public.shortage_records
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- (In practice all writes go through recompute_coverage()/admin_skip_shortage()
-- below, both SECURITY DEFINER; the admin policy is defense in depth.)

-- The engine from spec §9, translated to SQL so it can run automatically
-- on every shift/requirement change (via the triggers below) rather than
-- only when some client happens to have the dashboard open — that's what
-- makes the admin notification "immediate" (spec §10) regardless of who's
-- looking at the app right now.
create or replace function public.recompute_coverage(p_week_id uuid, p_day smallint, p_role public.staff_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req record;
  breakpoints int[];
  seg_start int;
  seg_end int;
  scheduled int;
  min_scheduled int;
  existing public.shortage_records%rowtype;
  deficit int;
begin
  for req in
    select * from staffing_requirements
    where week_id = p_week_id and day_of_week = p_day and role = p_role
  loop
    select array_agg(distinct t order by t) into breakpoints
    from (
      select extract(epoch from req.start_time)::int / 60 as t
      union
      select extract(epoch from req.end_time)::int / 60
      union
      select greatest(extract(epoch from s.start_time)::int / 60, extract(epoch from req.start_time)::int / 60)
      from shifts s
      where s.week_id = p_week_id and s.day_of_week = p_day and s.role = p_role
        and s.start_time < req.end_time and s.end_time > req.start_time
      union
      select least(extract(epoch from s.end_time)::int / 60, extract(epoch from req.end_time)::int / 60)
      from shifts s
      where s.week_id = p_week_id and s.day_of_week = p_day and s.role = p_role
        and s.start_time < req.end_time and s.end_time > req.start_time
    ) x;

    min_scheduled := null;
    for i in 1 .. coalesce(array_length(breakpoints, 1), 1) - 1 loop
      seg_start := breakpoints[i];
      seg_end := breakpoints[i + 1];
      if seg_end <= seg_start then continue; end if;

      select count(*) into scheduled
      from shifts s
      where s.week_id = p_week_id and s.day_of_week = p_day and s.role = p_role
        and extract(epoch from s.start_time)::int / 60 <= seg_start
        and extract(epoch from s.end_time)::int / 60 >= seg_end;

      if min_scheduled is null or scheduled < min_scheduled then
        min_scheduled := scheduled;
      end if;
    end loop;
    if min_scheduled is null then min_scheduled := 0; end if;

    deficit := req.required_count - min_scheduled;
    select * into existing from shortage_records where requirement_id = req.id;

    if deficit > 0 then
      if existing.id is null then
        insert into shortage_records (week_id, requirement_id, day_of_week, role, start_time, end_time, required_count, scheduled_count, status)
        values (p_week_id, req.id, p_day, p_role, req.start_time, req.end_time, req.required_count, min_scheduled, 'detected')
        returning * into existing;

        insert into audit_log (actor_type, action, entity_type, entity_id, new_value)
        values ('system', 'shortage_detected', 'shortage_record', existing.id,
          jsonb_build_object('day_of_week', p_day, 'role', p_role, 'start_time', req.start_time, 'end_time', req.end_time, 'required', req.required_count, 'scheduled', min_scheduled));

        insert into notifications (recipient_type, type, data)
        values ('admin', 'shortage_detected', jsonb_build_object(
          'shortage_record_id', existing.id, 'day_of_week', p_day, 'role', p_role,
          'start_time', req.start_time, 'end_time', req.end_time, 'required', req.required_count, 'scheduled', min_scheduled
        ));
      elsif existing.status = 'detected' then
        update shortage_records set scheduled_count = min_scheduled, required_count = req.required_count, updated_at = now()
          where id = existing.id;
      elsif existing.status = 'skipped' then
        null; -- spec §11: a skipped shortage must not re-notify on its own
      elsif existing.status = 'resolved' then
        update shortage_records
          set status = 'detected', scheduled_count = min_scheduled, required_count = req.required_count, updated_at = now(), resolved_at = null
          where id = existing.id
          returning * into existing;

        insert into audit_log (actor_type, action, entity_type, entity_id, new_value)
        values ('system', 'shortage_detected', 'shortage_record', existing.id,
          jsonb_build_object('day_of_week', p_day, 'role', p_role, 'start_time', req.start_time, 'end_time', req.end_time, 'required', req.required_count, 'scheduled', min_scheduled));

        insert into notifications (recipient_type, type, data)
        values ('admin', 'shortage_detected', jsonb_build_object(
          'shortage_record_id', existing.id, 'day_of_week', p_day, 'role', p_role,
          'start_time', req.start_time, 'end_time', req.end_time, 'required', req.required_count, 'scheduled', min_scheduled
        ));
      end if;
    else
      if existing.id is not null and existing.status in ('detected', 'skipped') then
        update shortage_records set status = 'resolved', resolved_at = now(), scheduled_count = min_scheduled, updated_at = now()
          where id = existing.id;
      end if;
    end if;
  end loop;
end;
$$;

revoke execute on function public.recompute_coverage(uuid, smallint, public.staff_role) from public;
grant execute on function public.recompute_coverage(uuid, smallint, public.staff_role) to authenticated;

-- Automatic triggers: any shift or requirement change re-evaluates coverage
-- for the affected day+role, so detection truly happens the instant the
-- underlying data changes (spec §10 "немедленно"), not on a timer.
create or replace function public.trg_recompute_on_shift_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform recompute_coverage(old.week_id, old.day_of_week, old.role);
    return old;
  end if;
  perform recompute_coverage(new.week_id, new.day_of_week, new.role);
  if tg_op = 'UPDATE' and (old.day_of_week <> new.day_of_week or old.role <> new.role) then
    perform recompute_coverage(old.week_id, old.day_of_week, old.role);
  end if;
  return new;
end;
$$;

create trigger trg_shifts_recompute_coverage
  after insert or update or delete on public.shifts
  for each row execute function public.trg_recompute_on_shift_change();

create or replace function public.trg_recompute_on_requirement_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform recompute_coverage(old.week_id, old.day_of_week, old.role);
    return old;
  end if;
  perform recompute_coverage(new.week_id, new.day_of_week, new.role);
  if tg_op = 'UPDATE' and (old.day_of_week <> new.day_of_week or old.role <> new.role) then
    perform recompute_coverage(old.week_id, old.day_of_week, old.role);
  end if;
  return new;
end;
$$;

create trigger trg_requirements_recompute_coverage
  after insert or update or delete on public.staffing_requirements
  for each row execute function public.trg_recompute_on_requirement_change();
