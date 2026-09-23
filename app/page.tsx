import { connection } from "next/server";
import { JobRunApp } from "@/components/jobrun/JobRunApp";
import { loadBoard } from "@/lib/adapters";

export default async function Home() {
  await connection(); // live data; render per request
  const initial = await loadBoard();
  return <JobRunApp initial={initial} />;
}
