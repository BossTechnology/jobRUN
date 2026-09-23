import { connection } from "next/server";
import { redirect } from "next/navigation";
import { JobRunApp } from "@/components/jobrun/JobRunApp";
import { loadBoard } from "@/lib/adapters";
import { CONFIG } from "@/lib/config";

export default async function Home() {
  await connection(); // live data; render per request
  const initial = await loadBoard();
  // Live mode: a session without an operators row can't read anything (RLS), so explain instead of showing an empty board.
  if (!CONFIG.SIMULATE && !initial) redirect("/login?e=not-operator");
  return <JobRunApp initial={initial} />;
}
