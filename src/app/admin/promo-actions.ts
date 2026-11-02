"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { invalidateCatalogCache } from "@/lib/catalog";
import { sendPromo } from "@/lib/promo";
import type { ActionState } from "./actions";

const digits = (v: FormDataEntryValue | null) => String(v ?? "").replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).trim();

/** On/off, after how many paid bookings a code is sent, and its discount */
export async function savePromoSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("promos");
  const every = Number(digits(formData.get("promo_every")));
  const percent = Number(digits(formData.get("promo_percent")));
  if (!Number.isInteger(every) || every < 1 || every > 1000) return { error: "عدد الحجوزات رقم من ١ إلى ١٠٠٠." };
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) return { error: "نسبة الخصم رقم من ١ إلى ١٠٠." };
  const rows = { promo_enabled: formData.get("promo_enabled") === "on" ? "1" : "0", promo_every: String(every), promo_percent: String(percent) };
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(rows))
      await tx.insert(s.settings).values({ key, value }).onConflictDoUpdate({ target: s.settings.key, set: { value } });
  });
  invalidateCatalogCache();
  revalidatePath("/admin/promos");
  return { ok: true, message: "تم حفظ إعدادات الرموز الترويجية." };
}

/** Send a customer's code again (WhatsApp and email) */
export async function resendPromo(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("promos");
  const p = await db.query.promoCodes.findFirst({ where: eq(s.promoCodes.id, Number(formData.get("id") ?? 0)) });
  if (!p) return { error: "الرمز غير موجود." };
  if (p.usedAt) return { error: "هذا الرمز مستخدم من قبل." };
  await sendPromo(p, "ar");
  return { ok: true, message: "تم إرسال الرمز مرة أخرى." };
}
