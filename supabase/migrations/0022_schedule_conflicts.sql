-- Stage 5: overlap detection (spec §18) — the one concrete, mechanically
-- detectable "situation needing manual review" the spec describes: the
-- same employee ending up scheduled on two overlapping time ranges the
-- same day (e.g. they accept an extra shortage shift that overlaps a
-- shift they'd already entered themselves). The system only ever
-- flags this for a human; it never decides which shift "wins".
create table public.schedule_conflicts (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.schedule_weeks (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  shift_id_a uuid not null references public.shifts (id) on delete cascade,
  shift_id_b uuid not null references public.shifts (id) on delete cascade,
  status text not null check (status in ('pending', 'confirmed')) default 'pending',
  detected_at timestamptz not null default now(),
  confirmed_by uuid references auth.users (id),
  confirmed_at timestamptz,
  unique (shift_id_a, shift_id_b)
);

alter table public.schedule_conflicts enable row level security;
create policy schedule_conflicts_select_admin on public.schedule_conflicts
  for select to authenticated using (public.is_admin());
create policy schedule_conflicts_admin_write on public.schedule_conflicts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter publication supabase_realtime add table public.schedule_conflicts;

create or replace function public.trg_detect_schedule_conflicts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other record;
  v_a uuid;
  v_b uuid;
begin
  for v_other in
    select * from shifts
    where employee_id = new.employee_id and day_of_week = new.day_of_week and week_id = new.week_id
      and id <> new.id
      and start_time < new.end_time and end_time > new.start_time
  loop
    -- Store the pair in a stable order so the same two shifts can never
    -- produce two separate conflict rows.
    if new.id < v_other.id then v_a := new.id; v_b := v_other.id; else v_a := v_other.id; v_b := new.id; end if;

    if not exists (select 1 from schedule_conflicts where shift_id_a = v_a and shift_id_b = v_b) then
      insert into schedule_conflicts (week_id, employee_id, day_of_week, shift_id_a, shift_id_b)
      values (new.week_id, new.employee_id, new.day_of_week, v_a, v_b);

      insert into audit_log (actor_type, action, entity_type, entity_id, new_value)
      values ('system', 'conflict_detected', 'shift', new.id, jsonb_build_object('shift_id_a', v_a, 'shift_id_b', v_b));

      insert into notifications (recipient_type, type, data)
      values ('admin', 'conflict_detected', jsonb_build_object(
        'employee_id', new.employee_id, 'day_of_week', new.day_of_week, 'shift_id_a', v_a, 'shift_id_b', v_b
      ));
    end if;
  end loop;
  return new;
end;
$$;

create trigger trg_shifts_detect_conflicts
  after insert on public.shifts
  for each row execute function public.trg_detect_schedule_conflicts();

create or replace function public.admin_confirm_conflict(p_conflict_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;

  update schedule_conflicts
    set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
    where id = p_conflict_id;

  insert into audit_log (actor_type, actor_admin_id, action, entity_type, entity_id)
  values ('admin', auth.uid(), 'conflict_confirmed', 'schedule_conflict', p_conflict_id);
end;
$$;

revoke execute on function public.admin_confirm_conflict(uuid) from public;
grant execute on function public.admin_confirm_conflict(uuid) to authenticated;
