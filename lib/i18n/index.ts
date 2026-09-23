import T from "./strings.js";

export type Lang = "en" | "es";
export type Strings = typeof T.en;

/* Same corrections as lib/ui/icons.tsx: single-family was missing and "re" is residential, not retail. */
Object.assign(T.en.types, { sf: "Single family", re: "Residential" });
Object.assign(T.es.types, { sf: "Unifamiliar", re: "Residencial" });

export const strings = (lang: Lang): Strings => T[lang] as Strings;
export const locale = (lang: Lang) => (lang === "es" ? "es-US" : "en-US");
