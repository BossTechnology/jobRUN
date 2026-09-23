/* Current conditions per state centroid from OpenWeather, cached 10 minutes (INTEGRATION.md §6.4).
   GET /api/map/weather?at=SC:33.8,-81.0|FL:28.1,-81.6 → { SC: { cond, temp }, … } */
import { z } from "zod";

const Point = z.tuple([z.string().regex(/^[A-Z]{2}$/), z.coerce.number().min(-90).max(90), z.coerce.number().min(-180).max(180)]);

function cond(main: string): "clear" | "cloud" | "rain" | "storm" | "snow" {
  if (main === "Thunderstorm") return "storm";
  if (main === "Snow") return "snow";
  if (main === "Rain" || main === "Drizzle") return "rain";
  if (main === "Clear") return "clear";
  return "cloud";
}

export async function GET(req: Request) {
  const key = process.env.OPENWEATHER_KEY;
  if (!key) return Response.json({ error: "weather not configured" }, { status: 501 });
  const at = new URL(req.url).searchParams.get("at") ?? "";
  const points = at.split("|").filter(Boolean).slice(0, 60).map((s) => {
    const [st, ll] = s.split(":");
    return Point.safeParse([st, ...(ll ?? "").split(",")]);
  });
  if (points.some((p) => !p.success)) return Response.json({ error: "bad points" }, { status: 400 });
  const out: Record<string, { cond: string; temp: number }> = {};
  await Promise.all(
    points.map(async (p) => {
      const [st, lat, lng] = p.data!;
      const r = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat.toFixed(2)}&lon=${lng.toFixed(2)}&units=imperial&appid=${key}`, { next: { revalidate: 600 } });
      if (!r.ok) return;
      const d = await r.json();
      out[st] = { cond: cond(d.weather?.[0]?.main ?? ""), temp: Math.round(d.main?.temp ?? 0) };
    }),
  );
  return Response.json(out, { headers: { "Cache-Control": "public, max-age=600" } });
}
