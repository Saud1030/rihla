"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { invalidateCatalogCache } from "@/lib/catalog";
import { addMessage, conversationById, setConversation } from "@/lib/chat";
import type { ActionState } from "./actions";

/* ---------- Conversations ---------- */

/** Staff reply: the customer sees it in the chat window within a few seconds */
export async function replyChat(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireSection("chat");
  const id = String(formData.get("id") ?? "");
  const text = String(formData.get("text") ?? "").trim().slice(0, 2000);
  if (!text) return { error: "اكتب الرد أولًا." };
  const c = await conversationById(id);
  if (!c) return { error: "المحادثة غير موجودة." };
  await addMessage(c, "staff", text, { staffName: admin.name });
  await setConversation(c.id, { status: "open", unreadAdmin: 0 });
  revalidatePath(`/admin/chat/${c.id}`);
  return { ok: true, message: "أُرسل الرد." };
}

export async function closeChat(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("chat");
  const c = await conversationById(String(formData.get("id") ?? ""));
  if (!c) return { error: "المحادثة غير موجودة." };
  if (c.status === "closed") return { ok: true, message: "المحادثة مغلقة." };
  await addMessage(c, "system", c.locale === "en" ? "The staff member ended the conversation." : "أنهى الموظف المحادثة.");
  await setConversation(c.id, { status: "closed", unreadAdmin: 0 });
  revalidatePath(`/admin/chat/${c.id}`);
  return { ok: true, message: "أُغلقت المحادثة." };
}

/** Deletes conversations (e.g. spam or old ones) */
export async function deleteChats(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("chat");
  const ids = formData.getAll("ids").map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 200);
  if (!ids.length) return { error: "حدّد محادثة واحدة على الأقل." };
  await db.delete(s.chatConversations).where(inArray(s.chatConversations.id, ids));
  revalidatePath("/admin/chat");
  return { ok: true, message: `حُذفت ${ids.length} محادثة.` };
}

/* ---------- Bot settings ---------- */

const settingsSchema = z.object({
  chat_enabled: z.enum(["0", "1"]),
  chat_handoff: z.enum(["live", "whatsapp", "both", "off"]),
  chat_bot_name_ar: z.string().trim().min(1).max(60),
  chat_bot_name_en: z.string().trim().max(60),
  chat_greeting_ar: z.string().trim().min(1).max(600),
  chat_greeting_en: z.string().trim().max(600),
  chat_fallback_ar: z.string().trim().min(1).max(600),
  chat_fallback_en: z.string().trim().max(600),
  chat_waiting_ar: z.string().trim().min(1).max(600),
  chat_waiting_en: z.string().trim().max(600),
});

export async function saveChatSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("chat");
  const raw = Object.fromEntries(formData.entries());
  const parsed = settingsSchema.safeParse({ ...raw, chat_enabled: raw.chat_enabled === "on" ? "1" : "0" });
  if (!parsed.success) return { error: "اكتب اسم البوت ورسالة الترحيب والرد البديل ورسالة التحويل للموظف بالعربي على الأقل." };
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(parsed.data)) {
      await tx.insert(s.settings).values({ key, value }).onConflictDoUpdate({ target: s.settings.key, set: { value } });
    }
  });
  invalidateCatalogCache();
  revalidatePath("/admin/chat/settings");
  return { ok: true, message: "تم حفظ إعدادات البوت. تظهر في الموقع فورًا." };
}

/* ---------- Questions & answers ---------- */

const faqSchema = z.object({
  questionAr: z.string().trim().min(2).max(200),
  questionEn: z.string().trim().max(200),
  answerAr: z.string().trim().min(2).max(2000),
  answerEn: z.string().trim().max(2000),
  keywords: z.string().trim().max(500),
  sortOrder: z.coerce.number().int().min(0).max(999),
  active: z.boolean(),
});

export async function saveFaq(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("chat");
  const id = Number(formData.get("id") ?? 0);
  const parsed = faqSchema.safeParse({
    questionAr: formData.get("questionAr") ?? "",
    questionEn: formData.get("questionEn") ?? "",
    answerAr: formData.get("answerAr") ?? "",
    answerEn: formData.get("answerEn") ?? "",
    keywords: formData.get("keywords") ?? "",
    sortOrder: formData.get("sortOrder") || 0,
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return { error: "اكتب السؤال والإجابة بالعربي على الأقل (حرفين أو أكثر)." };
  if (id > 0) {
    const done = await db.update(s.chatFaqs).set(parsed.data).where(eq(s.chatFaqs.id, id)).returning({ id: s.chatFaqs.id });
    if (!done.length) return { error: "السؤال غير موجود." };
  } else {
    await db.insert(s.chatFaqs).values(parsed.data);
    invalidateCatalogCache();
    revalidatePath("/admin/chat/settings");
    redirect("/admin/chat/settings?added=1#faqs");
  }
  invalidateCatalogCache();
  revalidatePath("/admin/chat/settings");
  return { ok: true, message: "تم حفظ السؤال." };
}

export async function deleteFaq(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("chat");
  const id = Number(formData.get("id") ?? 0);
  await db.delete(s.chatFaqs).where(eq(s.chatFaqs.id, id));
  invalidateCatalogCache();
  revalidatePath("/admin/chat/settings");
  redirect("/admin/chat/settings?deleted=1#faqs");
}
