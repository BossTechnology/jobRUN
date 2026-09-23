/* Zendesk mirror (INTEGRATION.md §8 /api/out/zendesk): every message and stage change becomes an internal
   comment on the job's ticket. Needs ZENDESK_SUBDOMAIN, ZENDESK_EMAIL and ZENDESK_TOKEN (API token auth). */
import "server-only";

export const zendeskConfigured = () => !!(process.env.ZENDESK_SUBDOMAIN && process.env.ZENDESK_EMAIL && process.env.ZENDESK_TOKEN);

export async function zendeskComment(ticketId: string, body: string, tags?: string[]) {
  if (!zendeskConfigured() || !ticketId) return { skipped: true as const };
  const id = ticketId.replace(/^ZD-/, "");
  if (!/^\d+$/.test(id)) return { skipped: true as const };
  const auth = Buffer.from(`${process.env.ZENDESK_EMAIL}/token:${process.env.ZENDESK_TOKEN}`).toString("base64");
  const res = await fetch(`https://${process.env.ZENDESK_SUBDOMAIN}.zendesk.com/api/v2/tickets/${id}.json`, {
    method: "PUT",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ticket: { comment: { body, public: false }, ...(tags?.length ? { additional_tags: tags } : {}) } }),
  });
  if (!res.ok) throw new Error(`Zendesk ${res.status}: ${await res.text()}`);
  return { ok: true as const };
}
