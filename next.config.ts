import type { NextConfig } from "next";

// Headless Chromium's compressed binary lives in @sparticuz/chromium/bin, which file tracing can't see.
const CHROMIUM_BIN = ["./node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**"];

const nextConfig: NextConfig = {
  // Headless Chromium for job report PDFs must not be bundled (lib/report/pdf.ts).
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    "/api/board/report": CHROMIUM_BIN,
    "/api/board/report/[id]": CHROMIUM_BIN,
    "/api/board/sync": CHROMIUM_BIN,
  },
};

export default nextConfig;
