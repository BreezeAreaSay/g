-- Idempotent: safe to run against a freshly (re)created database even
-- though roles live at the cluster level and survive dropdb/createdb.
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;

do $$ begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null;
end $$;

-- Real Supabase projects always have this publication pre-created for
-- Realtime; replicate that so migrations that add tables to it apply
-- cleanly here too.
do $$ begin
  create publication supabase_realtime;
exception when duplicate_object then null;
end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);

-- Matches Supabase's real auth.uid() definition (checks the per-claim GUC
-- some setups use, falling back to parsing the JSON claims GUC that
-- PostgREST actually sets on every request).
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema auth to authenticated, anon, service_role;
grant select on auth.users to authenticated, anon, service_role;
grant usage on schema public to authenticated, anon, service_role;

-- Mirrors the real Supabase platform's "auto_expose_new_tables" default:
-- it grants at CREATE time (via default privileges owned by the migration
-- role), not as a one-off blanket grant afterwards — so a later explicit
-- REVOKE in a migration still correctly wins, exactly like in production.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, anon;
