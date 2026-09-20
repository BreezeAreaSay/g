-- Stage 1: extensions and shared enum types.
create extension if not exists pgcrypto;

-- A person can be a waiter, a dishwasher, or both (see employee_roles).
create type public.staff_role as enum ('waiter', 'dishwasher');

-- Digits-only phone normalization, with one Russia-specific rule: a local
-- 11-digit number written with a leading "8" (the domestic trunk prefix,
-- e.g. "8 900 111-11-11") is the same phone as "+7 900 111-11-11" — very
-- common for staff to type interchangeably — so both must normalize to the
-- same value or the same person would accidentally get two employee rows.
-- IMMUTABLE is required because this function is used in a generated column.
create or replace function public.normalize_phone(p_phone text)
returns text
language sql
immutable
as $$
  select case
    when length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) = 11
      and left(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 1) = '8'
    then '7' || substring(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') from 2)
    else regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
  end;
$$;
