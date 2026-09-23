/* Session refresh for Proxy (Supabase SSR pattern): keeps auth cookies fresh for Server Components and,
   in live mode, sends visitors without a session to /login. */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { CONFIG } from "@/lib/config";

const PUBLIC_PATHS = ["/login", "/auth", "/api/in/", "/api/cron/", "/prototype.html"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) return response;

  const supabase = createServerClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(toSet, headers) {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Do not run code between createServerClient and getClaims() (see Supabase SSR docs).
  const { data } = await supabase.auth.getClaims();

  const path = request.nextUrl.pathname;
  if (!CONFIG.SIMULATE && !data?.claims && !PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}
