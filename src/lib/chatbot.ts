import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Locale } from "@/i18n/dictionaries";
import { getSettings } from "./catalog";
import { cached } from "./memo";
import { bestMatch, fillTokens, pickLang } from "./chat-match";

export type Handoff = "live" | "whatsapp" | "both" | "off";
const HANDOFFS: Handoff[] = ["live", "whatsapp", "both", "off"];

export type ChatConfig = {
  enabled: boolean;
  botName: string;
  greeting: string;
  fallback: string;
  waiting: string;
  handoff: Handoff;
  whatsapp: string;
  faqs: { id: number; question: string }[];
};

/** Active questions, cached like the rest of the catalog (admin edits clear the cache) */
export const getFaqs = () =>
  cached("chat-faqs", () => db.select().from(s.chatFaqs).where(eq(s.chatFaqs.active, true)).orderBy(asc(s.chatFaqs.sortOrder), asc(s.chatFaqs.id)));

const pick = pickLang;

export async function getChatConfig(lang: Locale): Promise<ChatConfig> {
  const [st, faqs] = await Promise.all([getSettings(), getFaqs()]);
  const handoff = (HANDOFFS as string[]).includes(st.chat_handoff) ? (st.chat_handoff as Handoff) : "both";
  return {
    enabled: st.chat_enabled === "1",
    botName: pick(st.chat_bot_name_ar, st.chat_bot_name_en, lang),
    greeting: fillTokens(pick(st.chat_greeting_ar, st.chat_greeting_en, lang), st, lang),
    fallback: fillTokens(pick(st.chat_fallback_ar, st.chat_fallback_en, lang), st, lang),
    waiting: fillTokens(pick(st.chat_waiting_ar, st.chat_waiting_en, lang), st, lang),
    // WhatsApp hand-over needs a number
    handoff: !st.whatsapp && handoff === "whatsapp" ? "off" : !st.whatsapp && handoff === "both" ? "live" : handoff,
    whatsapp: (st.whatsapp ?? "").replace(/[^\d]/g, ""),
    faqs: faqs.map((f) => ({ id: f.id, question: pick(f.questionAr, f.questionEn, lang) })),
  };
}

/** The answer to a tapped question */
export async function answerFor(id: number, lang: Locale) {
  const [faqs, st] = await Promise.all([getFaqs(), getSettings()]);
  const f = faqs.find((x) => x.id === id);
  if (!f) return null;
  return { question: pick(f.questionAr, f.questionEn, lang), answer: fillTokens(pick(f.answerAr, f.answerEn, lang), st, lang) };
}

/** Finds the stored answer that best fits a typed question (see chat-match.ts) */
export async function matchQuestion(text: string, lang: Locale) {
  const [faqs, st] = await Promise.all([getFaqs(), getSettings()]);
  const f = bestMatch(text, faqs);
  return f ? fillTokens(pick(f.answerAr, f.answerEn, lang), st, lang) : null;
}
