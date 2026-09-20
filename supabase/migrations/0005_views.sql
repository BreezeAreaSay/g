-- Stage 1: the public roster view.
--
-- Why a view and not just "be careful in the frontend": Postgres views run
-- with the privileges of their OWNER for row-level-security purposes
-- (unless created with security_invoker=true, which we deliberately do NOT
-- use here). Migrations run as the project owner role, which bypasses RLS
-- on public.employees — so this view can read every row, but it only
-- SELECTs the columns listed below. There is no `phone` column in the
-- view's definition, so no query against this view can ever return a
-- phone number, no matter what the caller's RLS grants would otherwise
-- allow. This is what satisfies spec §20/§33: phone numbers are only
-- reachable through the `employees` table itself, which RLS restricts to
-- "your own row, or an admin".
create view public.employee_roster as
  select
    e.id,
    e.name,
    e.is_active,
    coalesce(
      array_agg(er.role order by er.role) filter (where er.role is not null),
      '{}'
    ) as roles
  from public.employees e
  left join public.employee_roles er on er.employee_id = e.id
  where e.is_active
  group by e.id, e.name, e.is_active;

-- Supabase's platform auto-exposes every new relation in `public` —
-- including views — to both `anon` and `authenticated` by default. We only
-- want signed-in sessions (at least an anonymous one) to read this, so the
-- grant to `authenticated` alone is not enough: `anon` must be revoked
-- explicitly, or the platform default would leave it readable pre-login.
revoke all on public.employee_roster from anon, public;
grant select on public.employee_roster to authenticated;
