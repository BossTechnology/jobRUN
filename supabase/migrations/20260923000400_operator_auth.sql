-- Operator-only access. The earlier policies were `to authenticated using (true)`: any signed-in user could
-- read and write everything. Now every policy requires an active row in operators linked to the caller.

-- Link operators to Supabase Auth users (matched by user_id, or by verified email on first sign-in).
alter table operators add column if not exists user_id uuid unique references auth.users(id) on delete set null;

-- Cancelled jobs leave the board but keep their record.
alter table jobs add column if not exists cancelled_at timestamptz;
alter table jobs add column if not exists cancel_reason text;
create index if not exists jobs_open_idx on jobs (stage) where cancelled_at is null;

-- Security-definer lookup lives in a schema the Data API does not expose.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_operator() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.operators o
    where o.active
      and (o.user_id = (select auth.uid())
           or (o.user_id is null and lower(o.email) = lower((select auth.jwt() ->> 'email'))))
  );
$$;
revoke all on function private.is_operator() from public, anon;
grant execute on function private.is_operator() to authenticated;

-- Replace every policy with operator-scoped ones.
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy "operators read" on customers      for select to authenticated using ((select private.is_operator()));
create policy "operators read" on contacts       for select to authenticated using ((select private.is_operator()));
create policy "operators read" on properties     for select to authenticated using ((select private.is_operator()));
create policy "operators read" on cleaning_teams for select to authenticated using ((select private.is_operator()));
create policy "operators read" on operators      for select to authenticated using ((select private.is_operator()));
create policy "operators read" on jobs           for select to authenticated using ((select private.is_operator()));
create policy "operators read" on messages       for select to authenticated using ((select private.is_operator()));
create policy "operators read" on job_events     for select to authenticated using ((select private.is_operator()));
create policy "operators read" on job_actions    for select to authenticated using ((select private.is_operator()));
create policy "operators read" on job_addons     for select to authenticated using ((select private.is_operator()));
create policy "operators read" on evidence       for select to authenticated using ((select private.is_operator()));
create policy "operators read" on tracker        for select to authenticated using ((select private.is_operator()));

create policy "operators update" on jobs for update to authenticated
  using ((select private.is_operator())) with check ((select private.is_operator()));
create policy "operators update" on messages for update to authenticated
  using ((select private.is_operator())) with check ((select private.is_operator()));

create policy "operators insert" on messages    for insert to authenticated with check ((select private.is_operator()));
create policy "operators insert" on job_events  for insert to authenticated with check ((select private.is_operator()));
create policy "operators insert" on job_actions for insert to authenticated with check ((select private.is_operator()));
create policy "operators insert" on job_addons  for insert to authenticated with check ((select private.is_operator()));
