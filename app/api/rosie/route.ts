/* POST /api/rosie — Rosie with the Anthropic key server-side (INTEGRATION.md §9).
   Body: { kind: "chat" | "insight", mode, scope, lang, turns, jobIds?, filters?, snapshot? }
   Live: the board snapshot is built here from Supabase; the client only sends the ids visible under its
   filters when scope is "focus". Simulation: the board exists only in the browser, so the client sends
   its snapshot (lib/rosie.ts boardSnapshot). Response: streamed plain text. */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { CONFIG } from "@/lib/config";
import { loadBoard } from "@/lib/adapters";
import { boardSnapshot, chatSystem, insightSystem } from "@/lib/rosie";

export const maxDuration = 60;

const Body = z.object({
  kind: z.enum(["chat", "insight"]),
  mode: z.enum(["situation", "recommendation", "prediction"]),
  scope: z.enum(["focus", "global"]),
  lang: z.enum(["en", "es"]).default("en"),
  jobIds: z.array(z.string()).max(2000).optional(),
  snapshot: z.string().max(60000).optional(),
  filters: z.array(z.string().max(200)).max(30).optional(),
  turns: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(8)
    .default([]),
});

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "Rosie is not configured (ANTHROPIC_API_KEY)" }, { status: 503 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });
  const { kind, mode, scope, lang, jobIds, turns } = parsed.data;
  if (kind === "chat" && turns.at(-1)?.role !== "user") return Response.json({ error: "last turn must be the user's question" }, { status: 400 });

  let snapshot: string;
  const board = await loadBoard();
  if (!CONFIG.SIMULATE && !board) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (board) {
    const props = new Map(board.world.props.map((p) => [p.id, p]));
    const ids = scope === "focus" && jobIds ? new Set(jobIds) : null;
    snapshot = boardSnapshot({
      jobs: ids ? board.jobs.filter((j) => ids.has(j.id)) : board.jobs,
      total: board.jobs.length,
      prop: (id) => props.get(id),
      teams: board.world.teams,
      operator: board.me.name,
      scope,
      tz: CONFIG.BUSINESS_TZ,
      filters: parsed.data.filters,
    });
  } else if (parsed.data.snapshot) snapshot = parsed.data.snapshot;
  else return Response.json({ error: "snapshot is required in simulation mode" }, { status: 400 });

  // Board data rides in the latest user turn so earlier turns stay stable.
  const messages: Anthropic.MessageParam[] =
    kind === "insight"
      ? [{ role: "user", content: `BOARD DATA\n${snapshot}` }]
      : turns.map((t, i) => (i === turns.length - 1 ? { role: "user", content: `BOARD DATA\n${snapshot}\n\nQUESTION: ${t.content}` } : t));

  const stream = new Anthropic().messages.stream({
    model: process.env.ROSIE_MODEL ?? "claude-sonnet-5",
    max_tokens: 16000,
    system: kind === "insight" ? insightSystem(mode, lang) : chatSystem(mode, lang),
    output_config: { effort: kind === "insight" ? "low" : "medium" },
    messages,
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") controller.enqueue(encoder.encode("\n[Rosie could not answer this request.]"));
        controller.close();
      } catch (err) {
        console.error("rosie stream failed", err);
        controller.error(err);
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
