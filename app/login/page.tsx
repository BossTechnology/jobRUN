import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "jobRUN · Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { e } = await searchParams;
  return <LoginForm initialError={typeof e === "string" ? e : undefined} />;
}
