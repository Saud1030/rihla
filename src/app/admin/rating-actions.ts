"use server";

import { revalidatePath } from "next/cache";
import { eq, not } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { invalidateCatalogCache } from "@/lib/catalog";
import type { ActionState } from "./actions";

/** Show or hide one rating in "what our customers say" on the website */
export async function toggleRating(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("ratings");
  const [r] = await db
    .update(s.ratings)
    .set({ visible: not(s.ratings.visible) })
    .where(eq(s.ratings.id, Number(formData.get("id") ?? 0)))
    .returning({ visible: s.ratings.visible });
  if (!r) return { error: "التقييم غير موجود." };
  invalidateCatalogCache();
  revalidatePath("/admin/ratings");
  return { ok: true, message: r.visible ? "يظهر في الموقع." : "أُخفي من الموقع." };
}

export async function saveReviewsDisplay(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("ratings");
  const entries: [string, string][] = [
    ["reviews_enabled", formData.get("reviews_enabled") === "on" ? "1" : "0"],
    ["reviews_min_stars", ["1", "2", "3", "4", "5"].includes(String(formData.get("reviews_min_stars"))) ? String(formData.get("reviews_min_stars")) : "4"],
  ];
  for (const [key, value] of entries) await db.insert(s.settings).values({ key, value }).onConflictDoUpdate({ target: s.settings.key, set: { value } });
  invalidateCatalogCache();
  revalidatePath("/admin/ratings");
  return { ok: true, message: "تم الحفظ." };
}
