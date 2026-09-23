import T from "./strings.js";

export type Lang = "en" | "es";
export type Strings = typeof T.en;

/* Same corrections as lib/ui/icons.tsx: single-family was missing and "re" is residential, not retail. */
Object.assign(T.en.types, { sf: "Single family", re: "Residential" });
Object.assign(T.es.types, { sf: "Unifamiliar", re: "Residencial" });

/* The prototype ran Rosie through claude.ai; here she runs through /api/rosie, so the "unavailable" text changes. */
Object.assign(T.en, { rosieOff: "Rosie isn't set up on this server yet (ANTHROPIC_API_KEY)." });
Object.assign(T.es, { rosieOff: "Rosie aún no está configurada en este servidor (ANTHROPIC_API_KEY)." });

/* Live mode before PINCH's cleaning-team list is loaded. */
Object.assign(T.en.st2, { noTeamsLoaded: "No cleaning teams loaded yet", noTeamsLoadedD: "Add PINCH's cleaning teams (cleaning_teams table) to text and confirm cleaners here." });
Object.assign(T.es.st2, { noTeamsLoaded: "Aún no hay equipos de limpieza cargados", noTeamsLoadedD: "Carga los equipos de limpieza de PINCH (tabla cleaning_teams) para escribirles y confirmarlos desde aquí." });

export const strings = (lang: Lang): Strings => T[lang] as Strings;
export const locale = (lang: Lang) => (lang === "es" ? "es-US" : "en-US");
