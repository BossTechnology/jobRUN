import "server-only";
import { createClient } from "@supabase/supabase-js";
import { CONFIG } from "@/lib/config";

/* Service-role client for webhooks, crons and Rosie's snapshot. Bypasses RLS — never import from client code. */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!CONFIG.SUPABASE_URL || !key) throw new Error("Supabase service role is not configured");
  return createClient(CONFIG.SUPABASE_URL, key, { auth: { persistSession: false } });
}
