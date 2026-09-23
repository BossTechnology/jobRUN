import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Headless Chromium for job report PDFs must not be bundled (lib/report/pdf.ts).
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
};

export default nextConfig;
