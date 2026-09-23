/* Magic-link landing: exchanges the PKCE code for a session, links the operator, returns to the board. */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { linkOperator } from "@/lib/supabase/link-operator";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const url = request.nextUrl.clone();
  url.search = "";
  if (code) {
    const sb = await createClient();
    const { data, error } = await sb.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      await linkOperator(data.user.id, data.user.email ?? "");
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }
  url.pathname = "/login";
  url.searchParams.set("e", "link");
  return NextResponse.redirect(url);
}
