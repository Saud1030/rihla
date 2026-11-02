"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { invalidateCatalogCache } from "@/lib/catalog";
import { newCode, promoSettings, sendPromo } from "@/lib/promo";
import { readSettings } from "@/lib/notify";
import { phoneWithCountry } from "@/lib/phone";
import { DEFAULT_COUNTRY, dialCode } from "@/lib/countries";
import { z } from "zod";
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

/** The admin adds a customer by hand: a code is made for them and sent on WhatsApp (and email if given) */
export async function addPromoCustomer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("promos");
  const name = String(formData.get("name") ?? "").trim().slice(0, 100);
  if (name.length < 2) return { error: "اكتب اسم العميل." };
  const country = String(formData.get("phoneCountry") ?? "");
  const phone = phoneWithCountry(dialCode(country) ?? dialCode(DEFAULT_COUNTRY), String(formData.get("phone") ?? ""));
  if (!phone) return { error: "رقم الواتساب غير صحيح. اختر الدولة واكتب الرقم." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (email && !z.email().max(200).safeParse(email).success) return { error: "البريد الإلكتروني غير صحيح." };
  const { percent } = promoSettings(await readSettings());
  let row: typeof s.promoCodes.$inferSelect | undefined;
  for (let attempt = 0; attempt < 5 && !row; attempt++)
    [row] = await db
      .insert(s.promoCodes)
      .values({ code: newCode(), customerName: name, customerPhone: phone, customerEmail: email || null, percent, bookingsCount: 0 })
      .onConflictDoNothing()
      .returning();
  if (!row) return { error: "تعذّر إنشاء الرمز. حاول مرة أخرى." };
  await sendPromo(row, "ar");
  revalidatePath("/admin/promos");
  return { ok: true, message: `تمت إضافة ${name} وإرسال الرمز ${row.code} له.` };
}
