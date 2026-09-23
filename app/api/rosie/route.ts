/* POST /api/rosie — Rosie with the Anthropic key server-side (INTEGRATION.md §9).
   Body: { kind: "chat" | "insight", mode, scope, lang, turns, jobIds? }
   The board snapshot is built here from the adapters; the client only sends the ids visible
   under its filters when scope is "focus". Response: streamed plain text. */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { CONFIG } from "@/lib/config";
import { loadJobs, loadProperties } from "@/lib/adapters";
import { boardSnapshot, chatSystem, insightSystem } from "@/lib/rosie";

export const maxDuration = 60;

const Body = z.object({
  kind: z.enum(["chat", "insight"]),
  mode: z.enum(["situation", "recommendation", "prediction"]),
  scope: z.enum(["focus", "global"]),
  lang: z.enum(["en", "es"]).default("en"),
  jobIds: z.array(z.string()).max(2000).optional(),
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

  let operator = "Federico";
  if (!CONFIG.SIMULATE) {
    const { createClient } = await import("@/lib/supabase/server");
    const { data } = await (await createClient()).auth.getUser();
    if (!data.user) return Response.json({ error: "unauthorized" }, { status: 401 });
    operator = data.user.email ?? operator;
  }

  const [jobs, props] = await Promise.all([loadJobs(), loadProperties()]);
  const ids = scope === "focus" && jobIds ? new Set(jobIds) : null;
  const inScope = ids ? jobs.filter((j) => ids.has(j.id)) : jobs;
  const snapshot = boardSnapshot({
    jobs: inScope,
    total: jobs.length,
    props: new Map(props.map((p) => [p.id, p])),
    operator,
    scope,
    tz: CONFIG.BUSINESS_TZ,
  });

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
