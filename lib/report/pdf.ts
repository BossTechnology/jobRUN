/* HTML → PDF with headless Chromium. On Vercel (Linux) it uses @sparticuz/chromium's bundled binary;
   locally set CHROME_PATH to a Chrome/Chromium executable. */
import "server-only";

export async function htmlToPdf(html: string): Promise<Uint8Array> {
  const [{ default: puppeteer }, chromium] = await Promise.all([import("puppeteer-core"), import("@sparticuz/chromium")]);
  const onLinux = process.platform === "linux";
  const executablePath = process.env.CHROME_PATH || (onLinux ? await chromium.default.executablePath() : "");
  if (!executablePath) throw new Error("No Chromium available: set CHROME_PATH for local PDF rendering");
  chromium.default.setGraphicsMode = false;
  const browser = await puppeteer.launch({ executablePath, args: onLinux ? chromium.default.args : [], headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({ format: "Letter", printBackground: true, margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" } });
  } finally {
    await browser.close();
  }
}
