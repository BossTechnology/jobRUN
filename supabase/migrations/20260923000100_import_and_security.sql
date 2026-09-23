-- jobRUN · follow-up to the handoff schema (20260923000000_initial_schema.sql, kept verbatim).
-- Adds what the one-time import needs and closes the RLS gaps the handoff left open.

-- ── Import support ────────────────────────────────────────────────
-- Stable keys so the import script can be re-run without duplicating rows.
alter table customers add constraint customers_name_key unique (name);
create unique index contacts_email_key on contacts (lower(email)) where email is not null;

-- Fields present in the PINCH CSV that the handoff schema did not carry.
alter table properties
  add column supervisor_name  text,
  add column supervisor_phone text,
  add column supervisor_email text,
  add column geocode_source   text default 'zip_centroid' check (geocode_source in ('zip_centroid','mapbox','manual','none')),
  add column import_key       text unique;   -- name|address1|postal_code, lower-cased

-- Keep geom in sync with lat/lng so geocoding only has to write lat/lng.
create or replace function properties_sync_geom() returns trigger language plpgsql as $$
begin
  if new.lat is not null and new.lng is not null then
    new.geom := st_setsrid(st_makepoint(new.lng, new.lat), 4326)::geography;
  else
    new.geom := null;
  end if;
  return new;
end $$;
create trigger properties_sync_geom before insert or update of lat, lng on properties
  for each row execute function properties_sync_geom();

-- ── Row level security ───────────────────────────────────────────
-- The handoff enabled RLS on jobs and messages only. Every table the client can reach
-- gets RLS; operators (authenticated) read everything, and writes that come from
-- webhooks/crons go through the service role, which bypasses RLS.
alter table customers      enable row level security;
alter table contacts       enable row level security;
alter table properties     enable row level security;
alter table cleaning_teams enable row level security;
alter table operators      enable row level security;
alter table job_events     enable row level security;
alter table job_actions    enable row level security;
alter table job_addons     enable row level security;
alter table evidence       enable row level security;
alter table tracker        enable row level security;

create policy "operators read" on customers      for select to authenticated using (true);
create policy "operators read" on contacts       for select to authenticated using (true);
create policy "operators read" on properties     for select to authenticated using (true);
create policy "operators read" on cleaning_teams for select to authenticated using (true);
create policy "operators read" on operators      for select to authenticated using (true);
create policy "operators read" on job_events     for select to authenticated using (true);
create policy "operators read" on job_actions    for select to authenticated using (true);
create policy "operators read" on job_addons     for select to authenticated using (true);
create policy "operators read" on evidence       for select to authenticated using (true);
create policy "operators read" on tracker        for select to authenticated using (true);

-- Actions taken from the board are written by the operator's session.
create policy "operators write" on job_events  for insert to authenticated with check (true);
create policy "operators write" on job_actions for insert to authenticated with check (true);
create policy "operators write" on job_addons  for insert to authenticated with check (true);

-- The view must respect the caller's RLS, not the owner's.
alter view jobs_unanswered set (security_invoker = true);
