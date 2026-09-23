/* Voice out (browser speechSynthesis) shared by the map tour and Rosie. Ported from voicesFor() / chosenVoice()
   / speak() / setVoice(). Optional server TTS (/api/tts) is a later step (INTEGRATION.md §9). */
import type { Lang } from "@/lib/i18n";

const PREF_KEY = "jm_voice";

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** Voices for a language, best first: natural/neural and Google voices, then female voices, then the local variant. */
export function voicesFor(lang: Lang): SpeechSynthesisVoice[] {
  if (!canSpeak()) return [];
  const pre = lang === "es" ? "es" : "en";
  const rank = (v: SpeechSynthesisVoice) => {
    let s = 0;
    if (/natural|neural|online/i.test(v.name)) s += 40;
    if (/google/i.test(v.name)) s += 25;
    if (/female|mujer|woman|samantha|jenny|aria|ava|zira|emma|michelle|susan|hazel|victoria|karen|moira|tessa|allison|camila|dalia|elena|sabina|helena|laura|paulina|m[oó]nica|luc[ií]a|elvira|paloma|ximena|valentina/i.test(v.name)) s += 20;
    if (/male|hombre|jorge|pablo|ra[uú]l|alex|guy|david|mark|diego|tom[aá]s/i.test(v.name) && !/female/i.test(v.name)) s -= 15;
    if (lang === "en" && /en-US/i.test(v.lang)) s += 8;
    if (lang === "es" && /es-(US|MX|419)/i.test(v.lang)) s += 8;
    return s;
  };
  return speechSynthesis.getVoices().filter((v) => (v.lang || "").toLowerCase().startsWith(pre)).sort((a, b) => rank(b) - rank(a));
}

function prefs(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
  } catch {
    return {};
  }
}

export function chosenVoice(lang: Lang) {
  const list = voicesFor(lang), name = prefs()[lang];
  return list.find((v) => v.name === name) || list[0] || null;
}

export function setVoice(lang: Lang, name: string) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({ ...prefs(), [lang]: name }));
  } catch {}
  speak(lang === "es" ? "Hola, soy Rosie." : "Hi, I am Rosie.", lang);
}

/** Reads text aloud; job numbers are spelled digit by digit and list markers become pauses. */
export function speak(text: string, lang: Lang) {
  if (!canSpeak() || !text) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(
      text
        .replace(/#(\d{5})/g, (_, n: string) => (lang === "es" ? "trabajo " : "job ") + n.split("").join(" "))
        .replace(/[*_`#>]/g, "")
        .replace(/\s*[•\-–]\s+/g, ". "),
    );
    u.lang = lang === "es" ? "es-US" : "en-US";
    const v = chosenVoice(lang);
    if (v) u.voice = v;
    u.rate = 0.98;
    u.pitch = 1.05;
    u.volume = 1;
    speechSynthesis.speak(u);
  } catch {}
}

export const stopSpeaking = () => canSpeak() && speechSynthesis.cancel();
