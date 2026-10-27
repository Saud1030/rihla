/**
 * The bot's matching and text filling. Pure functions (no database), used by the
 * server and by the static preview, so both answer the same way.
 */
import { parseCancelPolicy } from "./policy";
import { fold } from "./text";

type Lang = "ar" | "en";
export type MatchableFaq = { questionAr: string; questionEn: string; answerAr: string; answerEn: string; keywords: string };

export const pickLang = (ar: string | undefined, en: string | undefined, lang: Lang) => (lang === "ar" ? ar || en : en || ar) ?? "";

/** {cancel_hours}, {cancel_percent}, {phone}, {whatsapp} in answers follow the current settings */
export function fillTokens(text: string, st: Record<string, string>, lang: Lang = "ar") {
  const p = parseCancelPolicy(st);
  const n = (x: number) => x.toLocaleString(lang === "ar" ? "ar-SA" : "en-US");
  const map: Record<string, string> = {
    cancel_hours: n(p.fullHours),
    cancel_percent: n(p.partialPercent),
    phone: st.phone ?? "",
    whatsapp: st.whatsapp ? `+${st.whatsapp.replace(/[^\d]/g, "")}` : "",
  };
  return text.replace(/\{(cancel_hours|cancel_percent|phone|whatsapp)\}/g, (_, k: string) => map[k]);
}

const STOP = new Set(["في", "من", "الى", "علي", "عن", "هل", "كيف", "ما", "ماذا", "متي", "ابغي", "ابي", "ودي", "the", "a", "an", "is", "to", "do", "i", "my", "can", "how", "what"]);

export const words = (t: string) =>
  fold(t)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^و(?=\p{L}{4,})/u, "")) // "والاسترداد" ~ "الاسترداد"
    .map((w) => w.replace(/^ال(?=\p{L}{3,})/u, "")) // "الحجز" ~ "حجز"
    .filter((w) => w.length >= 2 && !STOP.has(w));

/** Same word, or one is a longer form of the other ("استرد" ~ "استرداد", "حجز" ~ "حجزي") */
const sameWord = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a)));

/**
 * The stored question that best fits a typed one, or null.
 * Each keyword (all of its words found in the text) counts 3, each word shared with the question counts 1.
 */
export function bestMatch<F extends MatchableFaq>(text: string, faqs: F[]): F | null {
  const typed = [...new Set(words(text))];
  const has = (w: string) => typed.some((x) => sameWord(x, w));
  let best: { score: number; f: F } | null = null;
  for (const f of faqs) {
    let score = 0;
    for (const k of f.keywords.split(/[,،\n]/)) {
      const kw = words(k);
      if (kw.length && kw.every(has)) score += 3;
    }
    for (const w of new Set([...words(f.questionAr), ...words(f.questionEn)])) if (w.length >= 3 && has(w)) score += 1;
    if (!best || score > best.score) best = { score, f };
  }
  return best && best.score >= 2 ? best.f : null;
}
