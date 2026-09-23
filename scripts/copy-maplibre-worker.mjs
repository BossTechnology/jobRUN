/* MapLibre v6 runs tile work in a module worker that imports a shared chunk by relative URL.
   Bundlers don't emit it, so copy both files to public/maplibre/ (gitignored) before dev/build;
   components/jobrun/MapMode.tsx points setWorkerUrl() at them. */
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/package.json")) + "/dist";
const out = new URL("../public/maplibre/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(join(dist, f), join(out, f));
