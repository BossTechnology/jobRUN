"use server";
/* Operator sign-in. Only existing Supabase Auth users can sign in (no self sign-up); being an active
   row in the operators table is what grants access to data (private.is_operator()). */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { linkOperator } from "@/lib/supabase/link-operator";

export type LoginState = { error?: string; sent?: boolean } | undefined;

export async function signInWithPassword(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim(), password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "missing" };
  const sb = await createClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "invalid" };
  await linkOperator(data.user.id, data.user.email ?? email);
  redirect("/");
}

export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  if (!email) return { error: "missing" };
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const sb = await createClient();
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/callback` } });
  if (error) return { error: "link" };
  return { sent: true };
}
