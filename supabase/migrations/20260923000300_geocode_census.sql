-- Allow the US Census geocoder as a geocode source (scripts/geocode-properties.mts).
alter table properties drop constraint if exists properties_geocode_source_check;
alter table properties add constraint properties_geocode_source_check
  check (geocode_source in ('zip_centroid','mapbox','census','manual','none'));
