/* QuickBooks bill created / paid → jobs.paid, paid_at; fires the payout orb via Realtime. */
import { notImplemented } from "@/lib/http/pending";

export async function POST(req: Request) {
  // TODO: verify the Intuit webhook signature, fetch the bill, match quickbooks_bill_id, set paid/paid_at.
  return notImplemented("/api/in/quickbooks", req, "QuickBooks webhook handler");
}
