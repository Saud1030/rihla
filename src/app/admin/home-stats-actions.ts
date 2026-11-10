"use server";

import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { invalidateCatalogCache } from "@/lib/catalog";
import { parseStats, STAT_SLOTS } from "@/lib/home-stats";
import type { ActionState } from "./actions";

/** The numbers strip on the home page: shown or hidden, and its four numbers with their labels */
export async function saveHomeStats(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("appearance");
  const rows = Array.from({ length: STAT_SLOTS }, (_, i) => ({
    value: String(formData.get(`value${i}`) ?? "").replace(/[^\d]/g, ""),
    ar: String(formData.get(`ar${i}`) ?? ""),
    en: String(formData.get(`en${i}`) ?? ""),
  }));
  const on = formData.get("on") === "on";
  const stats = parseStats(JSON.stringify(rows));
  if (on && !stats.some((x) => x.ar || x.en)) return { error: "اكتب وصفًا لرقم واحد على الأقل." };
  const values = [
    { key: "home_stats_on", value: on ? "1" : "0" },
    { key: "home_stats", value: JSON.stringify(stats) },
  ];
  await db.transaction(async (tx) => {
    for (const v of values) await tx.insert(s.settings).values(v).onConflictDoUpdate({ target: s.settings.key, set: { value: v.value } });
  });
  invalidateCatalogCache();
  revalidatePath("/admin/appearance");
  revalidatePath("/[lang]", "page");
  return { ok: true, message: on ? "تم الحفظ. الأرقام ظاهرة في الصفحة الرئيسية." : "تم الحفظ. الأرقام مخفية من الصفحة الرئيسية." };
}
