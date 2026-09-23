import { describe, expect, it } from "vitest";
import { reportHtml } from "@/lib/report/template";
import { job, world } from "./helpers";

describe("job report template", () => {
  it("renders the job, price, evidence placeholders and escapes user text", () => {
    const j = job({ id: "J10402", stage: 4, evidence: 4, unit: "<4B>", actions: [{ t: Date.now(), who: "Jake", key: "addon", label: "Add add-on", reason: "PM asked" }] });
    const p = world.prop(j.prop);
    const html = reportHtml({ job: j, prop: p, custName: "Greystar & Co", team: ["Sparkle Co.", "(203) 555-0142"], lang: "en" });
    expect(html).toContain("#10402");
    expect(html).toContain("&lt;4B&gt;");
    expect(html).toContain("Greystar &amp; Co");
    expect(html).toContain("$145.00");
    expect(html.match(/<img /g)).toHaveLength(4);
    expect(html).toContain("PM asked");
  });

  it("uses real evidence URLs when given", () => {
    const j = job({ stage: 3, evidence: 2 });
    const html = reportHtml({ job: j, prop: world.prop(j.prop), custName: "X", team: null, lang: "es", photos: { before: ["https://x/b.jpg"], after: ["https://x/a.jpg"] } });
    expect(html).toContain('src="https://x/b.jpg"');
    expect(html).toContain('lang="es"');
  });
});
