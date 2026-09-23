/* Production switches — mirrors CONFIG in public/prototype.html (see docs/INTEGRATION.md §3). */
export const CONFIG = {
  SIMULATE: process.env.NEXT_PUBLIC_SIMULATE !== "false",
  MAP_PROVIDER: "mapbox" as "mapbox" | "maptiler" | "google",
  MAP_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "",
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  TRAFFIC_PROVIDER: "tomtom" as "tomtom" | "google",
  WEATHER_PROVIDER: "openweather" as const,
  ROSIE_ENDPOINT: "/api/rosie",
  BUSINESS_TZ: process.env.BUSINESS_TZ ?? "America/New_York",
};
