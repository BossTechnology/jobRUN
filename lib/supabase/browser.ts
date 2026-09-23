import { createBrowserClient } from "@supabase/ssr";
import { CONFIG } from "@/lib/config";
import type { Database } from "./database.types";

/* Client components: board realtime subscriptions and operator actions (RLS applies). */
export function createClient() {
  return createBrowserClient<Database>(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
}
