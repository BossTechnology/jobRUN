import { createBrowserClient } from "@supabase/ssr";
import { CONFIG } from "@/lib/config";

/* Client components: board realtime subscriptions and operator actions (RLS applies). */
export function createClient() {
  return createBrowserClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
}
