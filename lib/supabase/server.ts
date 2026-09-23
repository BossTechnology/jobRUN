import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { CONFIG } from "@/lib/config";
import type { Database } from "./database.types";

/* Server components and route handlers acting as the signed-in operator (RLS applies). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only; the proxy refreshes the session.
        }
      },
    },
  });
}
