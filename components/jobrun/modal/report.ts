/* Print-ready job report in a new tab (jobReport()); the same template renders to PDF server-side. */
import type { BoardCtx } from "@/lib/board/context";
import type { Job } from "@/lib/domain/types";
import { CONFIG } from "@/lib/config";
import { reportHtml } from "@/lib/report/template";

export { photoSrc } from "@/lib/report/template";

/** Opens the server-rendered PDF (live: stored copy; simulation: rendered from this board), falling back to
    the printable HTML when the server can't render (e.g. local dev without Chromium). */
export async function jobReport({ w, l, lang, toast }: BoardCtx, j: Job) {
  const input = { job: j, prop: w.prop(j.prop), custName: w.cust(j.cust).n, team: j.team != null ? w.teams[j.team] : null, lang };
  const win = window.open("", "_blank");
  if (!win) { toast(l.st2.popupBlocked); return; }
  try {
    const res = CONFIG.SIMULATE
      ? await fetch("/api/board/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })
      : await fetch(`/api/board/report/${j.id}`);
    if (res.ok && res.headers.get("content-type")?.includes("pdf")) {
      win.location.href = URL.createObjectURL(await res.blob());
      toast(l.st2.reportOpened);
      return;
    }
  } catch {}
  const html = reportHtml(input);
  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(() => {
    try { win.focus(); win.print(); } catch {}
  }, 400);
  toast(l.st2.reportOpened);
}
