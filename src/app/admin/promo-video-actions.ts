"use server";

import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { invalidateCatalogCache } from "@/lib/catalog";
import type { ActionState } from "./actions";

/** Promo video on the home page: shown or hidden, its heading, and where it sits */
export async function savePromoVideo(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("appearance");
  const str = (k: string, max: number) => String(formData.get(k) ?? "").trim().slice(0, max);
  const place = formData.get("place") === "top" ? "top" : "after-banners";
  const values = [
    { key: "promo_video_on", value: formData.get("on") === "on" ? "1" : "0" },
    { key: "promo_video_title_ar", value: str("titleAr", 120) },
    { key: "promo_video_title_en", value: str("titleEn", 120) },
    { key: "promo_video_place", value: place },
    { key: "promo_video_sound", value: formData.get("controls") === "on" ? "1" : "0" },
  ];
  await db.transaction(async (tx) => {
    for (const v of values) await tx.insert(s.settings).values(v).onConflictDoUpdate({ target: s.settings.key, set: { value: v.value } });
  });
  invalidateCatalogCache();
  revalidatePath("/admin/appearance");
  revalidatePath("/[lang]", "page");
  return { ok: true, message: formData.get("on") === "on" ? "تم الحفظ. الفيديو ظاهر في الصفحة الرئيسية." : "تم الحفظ. الفيديو مخفي من الصفحة الرئيسية." };
}
