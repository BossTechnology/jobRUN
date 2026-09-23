-- Move PostGIS out of the exposed public schema (Supabase advisors: rls_disabled_in_public on
-- spatial_ref_sys, extension_in_public, security-definer st_estimatedextent callable by anon).
-- PostGIS is not relocatable, so it is dropped and re-created; geom is rebuilt from lat/lng.
drop extension if exists postgis cascade;            -- also drops properties.geom and its index
create schema if not exists extensions;
create extension postgis with schema extensions;

alter table properties add column geom extensions.geography(point, 4326);
create index properties_geom_idx on properties using gist (geom);

create or replace function properties_sync_geom() returns trigger language plpgsql
set search_path = public, extensions as $$
begin
  if new.lat is not null and new.lng is not null then
    new.geom := st_setsrid(st_makepoint(new.lng, new.lat), 4326)::geography;
  else
    new.geom := null;
  end if;
  return new;
end $$;

update properties set lat = lat where lat is not null;   -- fires the trigger to fill geom
