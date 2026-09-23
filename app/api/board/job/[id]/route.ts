/* GET /api/board/job/:id — one job, freshly read for the signed-in operator (after a Realtime change). */
import { loadJob } from "@/lib/adapters/supabase";

export async function GET(_req: Request, ctx: RouteContext<"/api/board/job/[id]">) {
  const { id } = await ctx.params;
  const n = Number(id.replace(/^J/, ""));
  if (!Number.isInteger(n) || n <= 0) return Response.json({ error: "bad id" }, { status: 400 });
  const job = await loadJob(n);
  return job ? Response.json(job) : Response.json({ error: "not found" }, { status: 404 });
}
