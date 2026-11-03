"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { invalidateCatalogCache } from "@/lib/catalog";
import { SEASON_DEFS } from "@/lib/price-rules-server";
import type { ActionState } from "./actions";

const digits = (v: FormDataEntryValue | null) => String(v ?? "").replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).trim();
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

async function saveSettings(rows: Record<string, string>) {
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(rows))
      await tx.insert(s.settings).values({ key, value }).onConflictDoUpdate({ target: s.settings.key, set: { value } });
  });
  invalidateCatalogCache();
}

/** One season: on/off, the % increase, and its Hijri start and end */
export async function saveSeason(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("catalog");
  const def = SEASON_DEFS.find((d) => d.key === formData.get("key"));
  if (!def) return { error: "الموسم غير موجود." };
  const percent = Number(digits(formData.get("percent")));
  if (!Number.isInteger(percent) || percent < 0 || percent > 300) return { error: "نسبة الزيادة رقم من ٠ إلى ٣٠٠." };
  const part = (k: string, max: number) => {
    const n = Number(digits(formData.get(k)));
    return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
  };
  const fm = part("fromMonth", 12), fd = part("fromDay", 30), tm = part("toMonth", 12), td = part("toDay", 30);
  if (!fm || !fd || !tm || !td) return { error: "اختر بداية ونهاية الموسم (الشهر واليوم)." };
  await saveSettings({
    [`season_${def.key}_enabled`]: formData.get("enabled") === "on" ? "1" : "0",
    [`season_${def.key}_percent`]: String(percent),
    [`season_${def.key}_from`]: `${fm}-${fd}`,
    [`season_${def.key}_to`]: `${tm}-${td}`,
  });
  revalidatePath("/admin/seasons");
  return { ok: true, message: `تم حفظ ${def.name.ar}.` };
}

/** All offers on or off at once (the switch at the top of the offers page) */
export async function setOffersEnabled(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("catalog");
  const on = formData.get("on") === "1";
  await saveSettings({ offers_enabled: on ? "1" : "0" });
  revalidatePath("/admin/offers");
  return { ok: true, message: on ? "تم تفعيل العروض." : "تم إيقاف كل العروض." };
}

function readOffer(formData: FormData) {
  const nameAr = String(formData.get("nameAr") ?? "").trim().slice(0, 80);
  const nameEn = String(formData.get("nameEn") ?? "").trim().slice(0, 80);
  const percent = Number(digits(formData.get("percent")));
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  if (nameAr.length < 2) return { error: "اكتب اسم العرض." } as const;
  if (!Number.isInteger(percent) || percent < 1 || percent > 90) return { error: "نسبة الخصم رقم من ١ إلى ٩٠." } as const;
  if (!isDate(startDate) || !isDate(endDate)) return { error: "اختر تاريخ البداية والنهاية." } as const;
  if (endDate < startDate) return { error: "تاريخ النهاية قبل البداية." } as const;
  return { values: { nameAr, nameEn, percent, startDate, endDate } } as const;
}

export async function addOffer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("catalog");
  const r = readOffer(formData);
  if ("error" in r) return { error: r.error };
  await db.insert(s.offers).values({ ...r.values, active: true });
  invalidateCatalogCache();
  revalidatePath("/admin/offers");
  return { ok: true, message: `تمت إضافة العرض «${r.values.nameAr}».` };
}

export async function saveOffer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("catalog");
  const r = readOffer(formData);
  if ("error" in r) return { error: r.error };
  const done = await db.update(s.offers).set(r.values).where(eq(s.offers.id, Number(formData.get("id") ?? 0))).returning({ id: s.offers.id });
  if (!done.length) return { error: "العرض غير موجود." };
  invalidateCatalogCache();
  revalidatePath("/admin/offers");
  return { ok: true, message: "تم حفظ العرض." };
}

/** One offer on or off by hand */
export async function toggleOffer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("catalog");
  const on = formData.get("on") === "1";
  await db.update(s.offers).set({ active: on }).where(eq(s.offers.id, Number(formData.get("id") ?? 0)));
  invalidateCatalogCache();
  revalidatePath("/admin/offers");
  return { ok: true, message: on ? "تم تفعيل العرض." : "تم إيقاف العرض." };
}

export async function deleteOffer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("catalog");
  await db.delete(s.offers).where(eq(s.offers.id, Number(formData.get("id") ?? 0)));
  invalidateCatalogCache();
  revalidatePath("/admin/offers");
  return { ok: true, message: "تم حذف العرض." };
}
