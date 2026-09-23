/* POST /api/board/report — simulation only: the board lives in the browser, so it sends the job and its
   property; the server renders the same template to PDF (nothing is stored). */
import { z } from "zod";
import { CONFIG } from "@/lib/config";
import type { Job, Prop, Team } from "@/lib/domain/types";
import { htmlToPdf } from "@/lib/report/pdf";
import { reportHtml } from "@/lib/report/template";

export const maxDuration = 60;

const Body = z.object({
  job: z.custom<Job>((v) => !!v && typeof v === "object" && typeof (v as Job).id === "string" && Array.isArray((v as Job).thread)),
  prop: z.custom<Prop>((v) => !!v && typeof v === "object" && typeof (v as Prop).n === "string"),
  custName: z.string().max(300),
  team: z.tuple([z.string(), z.string()]).nullable(),
  lang: z.enum(["en", "es"]),
});

export async function POST(req: Request) {
  if (!CONFIG.SIMULATE) return Response.json({ error: "live mode uses GET /api/board/report/:id" }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });
  try {
    const pdf = await htmlToPdf(reportHtml({ ...parsed.data, team: parsed.data.team as Team | null }));
    return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="PINCH-${parsed.data.job.id.slice(1)}.pdf"` } });
  } catch (e) {
    return Response.json({ error: String((e as Error).message ?? e) }, { status: 501 });
  }
}
