/* TomTom Traffic Flow raster tiles, proxied so TOMTOM_TRAFFIC_KEY stays server-side (INTEGRATION.md §6.3). */
export async function GET(_req: Request, ctx: RouteContext<"/api/map/traffic/[z]/[x]/[y]">) {
  const key = process.env.TOMTOM_TRAFFIC_KEY;
  if (!key) return new Response("traffic not configured", { status: 501 });
  const { z, x, y } = await ctx.params;
  if (![z, x, y].every((v) => /^\d+$/.test(v))) return new Response("bad tile", { status: 400 });
  const res = await fetch(`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/${z}/${x}/${y}.png?key=${key}&tileSize=256`);
  if (!res.ok) return new Response("upstream error", { status: 502 });
  return new Response(res.body, {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=60, s-maxage=60" },
  });
}
