-- ===========================================================================
-- Local PostgreSQL test harness: simulates the Supabase environment
-- (auth schema, auth.uid(), anon/authenticated/service_role roles) so the
-- real migrations + RLS policies can be tested outside Supabase.
-- NOT part of production. Run: bash tests/local-pg/run.sh
-- ===========================================================================

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key,
  email              text,
  encrypted_password text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Mimic Supabase's auth.uid() (tolerates an unset/empty GUC, which real
-- Supabase never produces but our test harness does after RESET)
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select case
    when coalesce(current_setting('request.jwt.claims', true), '') ~ '^\s*\{' then
      nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
    else null
  end
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select on auth.users to postgres;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
