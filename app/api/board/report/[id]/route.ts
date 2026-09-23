/* GET /api/board/report/:id — live mode: renders the job report to PDF, stores it in the "reports" bucket and
   returns it (INTEGRATION.md §10). Signed-in operators only. */
import { currentOperator } from "@/lib/adapters/supabase";
import { CONFIG } from "@/lib/config";
import { storeReport } from "@/lib/report/deliver";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

export async function GET(_req: Request, ctx: RouteContext<"/api/board/report/[id]">) {
  if (CONFIG.SIMULATE) return Response.json({ error: "use POST /api/board/report in simulation" }, { status: 400 });
  if (!(await currentOperator(await createClient()))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const n = Number((await ctx.params).id.replace(/^J/, ""));
  if (!Number.isInteger(n) || n <= 0) return Response.json({ error: "bad id" }, { status: 400 });
  try {
    const { pdf } = await storeReport(n);
    return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="PINCH-${n}.pdf"` } });
  } catch (e) {
    return Response.json({ error: String((e as Error).message ?? e) }, { status: 500 });
  }
}
