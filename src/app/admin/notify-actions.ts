"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireAdmin, requireSection } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { deliver } from "@/lib/notify";
import { invalidateCatalogCache } from "@/lib/catalog";
import type { ActionState } from "./actions";

/** Booking staff and message staff can both retry or mark a message */
async function guard() {
  const me = await requireAdmin();
  return can(me, "bookings") || can(me, "messages");
}

export async function retryNotification(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await guard())) return { error: "ليست لديك صلاحية." };
  const id = Number(formData.get("id") ?? 0);
  const row = await db.query.notifications.findFirst({ where: eq(s.notifications.id, id) });
  if (!row) return { error: "الرسالة غير موجودة." };
  const out = await deliver({ ...row, status: row.status === "failed" ? "pending" : row.status });
  revalidatePath("/admin/messages");
  revalidatePath("/admin/bookings/[ref]", "page");
  return out.status === "sent"
    ? { ok: true, message: "أُرسلت الرسالة." }
    : out.status === "failed"
      ? { error: out.error ?? "تعذّر الإرسال." }
      : { error: "الإرسال التلقائي غير مربوط. استخدم «إرسال عبر واتساب»." };
}

/** Sent by hand (from the WhatsApp button or the mail app) */
export async function markNotificationManual(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await guard())) return { error: "ليست لديك صلاحية." };
  await db
    .update(s.notifications)
    .set({ status: "manual", sentAt: new Date(), error: null })
    .where(eq(s.notifications.id, Number(formData.get("id") ?? 0)));
  revalidatePath("/admin/messages");
  revalidatePath("/admin/bookings/[ref]", "page");
  return { ok: true, message: "سُجّلت كمرسلة." };
}

const settingsSchema = z.object({
  wa_template_lang: z.string().trim().regex(/^[a-z]{2}(_[A-Z]{2})?$/),
  wa_tpl_driver_trip: z.string().trim().regex(/^[a-z0-9_]{0,512}$/),
  wa_tpl_customer_driver: z.string().trim().regex(/^[a-z0-9_]{0,512}$/),
  wa_tpl_rating_request: z.string().trim().regex(/^[a-z0-9_]{0,512}$/),
  notify_email: z.union([z.literal(""), z.email().max(200)]),
});

export async function saveNotifySettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("messages");
  const parsed = settingsSchema.safeParse({
    wa_template_lang: formData.get("wa_template_lang") || "ar",
    wa_tpl_driver_trip: formData.get("wa_tpl_driver_trip") ?? "",
    wa_tpl_customer_driver: formData.get("wa_tpl_customer_driver") ?? "",
    wa_tpl_rating_request: formData.get("wa_tpl_rating_request") ?? "",
    notify_email: String(formData.get("notify_email") ?? "").trim(),
  });
  if (!parsed.success) {
    const f = String(parsed.error.issues[0]?.path[0] ?? "");
    return { error: f === "notify_email" ? "البريد الإلكتروني غير صحيح." : f === "wa_template_lang" ? "رمز اللغة مثل ar أو en_US." : "اسم القالب بحروف إنجليزية صغيرة وأرقام و _ فقط، كما هو في Meta." };
  }
  const values: Record<string, string> = {
    ...parsed.data,
    wa_auto: formData.get("wa_auto") === "on" ? "1" : "0",
    rating_enabled: formData.get("rating_enabled") === "on" ? "1" : "0",
  };
  for (const [key, value] of Object.entries(values))
    await db.insert(s.settings).values({ key, value }).onConflictDoUpdate({ target: s.settings.key, set: { value } });
  invalidateCatalogCache();
  revalidatePath("/admin/messages");
  return { ok: true, message: "تم الحفظ." };
}
