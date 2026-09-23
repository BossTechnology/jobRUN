/* Adapter switch (INTEGRATION.md §4). With CONFIG.SIMULATE the browser generates the board itself (lib/sim),
   exactly like the prototype; otherwise the server loads it from Supabase for the signed-in operator, the
   browser follows Realtime changes (components/jobrun/LiveSync.tsx) and writes go through /api/board/sync.

   Still to implement against PINCH's systems (need their credentials / API contracts):
   - sendMessage delivery → Gmail send (email), TrueDialog (SMS); messages are stored and mirrored to Zendesk today
   - writeWorkApp(job) → /api/out/workapp */
import "server-only";
import { CONFIG } from "@/lib/config";

export async function loadBoard() {
  if (CONFIG.SIMULATE) return null;
  return (await import("./supabase")).loadBoard();
}
