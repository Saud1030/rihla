"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { invalidateCatalogCache } from "@/lib/catalog";
import { detectFile, IMAGE_TYPES, MB } from "@/lib/files";
import type { ActionState } from "./actions";
import { HERO_SLOTS, isHeroSlot } from "@/lib/brand";

const MAX = 2 * MB;

/** A page of this site ("/ar/routes") or a full https:// link; anything else is refused */
function cleanLink(v: string) {
  const link = v.trim();
  if (!link) return "";
  if (link.startsWith("/") && !link.startsWith("//") && !/[\s\\]/.test(link)) return link;
  try {
    const u = new URL(link);
    if (u.protocol === "https:") return u.toString();
  } catch {}
  return null;
}

const schema = z.object({
  titleAr: z.string().trim().max(120),
  titleEn: z.string().trim().max(120),
  textAr: z.string().trim().max(240),
  textEn: z.string().trim().max(240),
  sortOrder: z.coerce.number().int().min(0).max(999),
  active: z.boolean(),
  startsOn: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  endsOn: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
});

/** Add a banner (image required) or edit one (new image optional) */
export async function saveBanner(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("appearance");
  const id = Number(formData.get("id") ?? 0);
  const parsed = schema.safeParse({
    titleAr: formData.get("titleAr") ?? "",
    titleEn: formData.get("titleEn") ?? "",
    textAr: formData.get("textAr") ?? "",
    textEn: formData.get("textEn") ?? "",
    sortOrder: formData.get("sortOrder") || 0,
    active: formData.get("active") === "on",
    startsOn: formData.get("startsOn") ?? "",
    endsOn: formData.get("endsOn") ?? "",
  });
  if (!parsed.success) return { error: "تحقق من النصوص والتواريخ." };
  const d = parsed.data;
  if (d.startsOn && d.endsOn && d.endsOn < d.startsOn) return { error: "تاريخ النهاية قبل تاريخ البداية." };
  const link = cleanLink(String(formData.get("link") ?? ""));
  if (link === null) return { error: "الرابط يجب أن يبدأ بـ / (صفحة في موقعك) أو https://" };

  let image: { mime: string; data: Buffer } | null = null;
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX) return { error: "حجم الصورة أكبر من ٢ ميجابايت. صغّرها ثم حاول مرة أخرى." };
    const buf = Buffer.from(await file.arrayBuffer());
    const kind = detectFile(buf, IMAGE_TYPES);
    if (!kind) return { error: "الصورة يجب أن تكون PNG أو JPG أو WEBP." };
    image = { mime: kind.mime, data: buf };
  }

  const values = { ...d, link, startsOn: d.startsOn || null, endsOn: d.endsOn || null, updatedAt: new Date() };
  if (id > 0) {
    const done = await db
      .update(s.banners)
      .set({ ...values, ...(image ?? {}) })
      .where(eq(s.banners.id, id))
      .returning({ id: s.banners.id });
    if (!done.length) return { error: "البنر غير موجود." };
  } else {
    if (!image) return { error: "اختر صورة البنر." };
    await db.insert(s.banners).values({ ...values, ...image });
    invalidateCatalogCache();
    revalidatePath("/admin/banners");
    // a fresh page: the add form is empty again and the notice says it worked
    redirect("/admin/banners?added=1");
  }
  invalidateCatalogCache();
  revalidatePath("/admin/banners");
  return { ok: true, message: "تم حفظ البنر." };
}

export async function deleteBanner(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("appearance");
  await db.delete(s.banners).where(eq(s.banners.id, Number(formData.get("id") ?? 0)));
  invalidateCatalogCache();
  revalidatePath("/admin/banners");
  redirect("/admin/banners?deleted=1");
}

export async function toggleBanner(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("appearance");
  const id = Number(formData.get("id") ?? 0);
  const [b] = await db.select({ active: s.banners.active }).from(s.banners).where(eq(s.banners.id, id)).limit(1);
  if (!b) return { error: "البنر غير موجود." };
  await db.update(s.banners).set({ active: !b.active, updatedAt: new Date() }).where(eq(s.banners.id, id));
  invalidateCatalogCache();
  revalidatePath("/admin/banners");
  return { ok: true, message: b.active ? "أُخفي البنر." : "يظهر البنر الآن." };
}

/* ---------- Background behind the home page's top section ---------- */

const HERO_MAX = 3 * MB;

export async function uploadHero(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("appearance");
  const file = formData.get("hero");
  if (!(file instanceof File) || file.size === 0) return { error: "اختر صورة الخلفية أولًا." };
  if (file.size > HERO_MAX) return { error: "حجم الصورة أكبر من ٣ ميجابايت. صغّرها ثم حاول مرة أخرى." };
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = detectFile(buf, IMAGE_TYPES);
  if (!kind) return { error: "الصورة يجب أن تكون PNG أو JPG أو WEBP." };
  // replace one photo, or take the first free place (up to five photos)
  const used = (await db.select({ key: s.assets.key }).from(s.assets).where(inArray(s.assets.key, [...HERO_SLOTS]))).map((r) => r.key);
  const wanted = String(formData.get("slot") ?? "");
  const key = isHeroSlot(wanted) ? wanted : HERO_SLOTS.find((k) => !used.includes(k));
  if (!key) return { error: "وصلت للحد الأقصى (٥ صور). احذف صورة أولًا." };
  const now = new Date();
  await db
    .insert(s.assets)
    .values({ key, mime: kind.mime, data: buf, updatedAt: now })
    .onConflictDoUpdate({ target: s.assets.key, set: { mime: kind.mime, data: buf, updatedAt: now } });
  // uploading a new image also switches the background on, with the veil chosen in the preview
  const overlay = String(formData.get("preview_overlay") ?? "");
  const settings: [string, string][] = [["hero_bg_enabled", "1"], ...(["light", "medium", "strong"].includes(overlay) ? ([["hero_bg_overlay", overlay]] as [string, string][]) : [])];
  for (const [k, value] of settings) await db.insert(s.settings).values({ key: k, value }).onConflictDoUpdate({ target: s.settings.key, set: { value } });
  invalidateCatalogCache();
  revalidatePath("/admin/banners");
  redirect("/admin/banners?hero=added#hero-card");
}

export async function removeHero(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("appearance");
  const key = String(formData.get("slot") ?? "hero");
  if (!isHeroSlot(key)) return { error: "صورة غير صحيحة." };
  await db.delete(s.assets).where(eq(s.assets.key, key));
  invalidateCatalogCache();
  revalidatePath("/admin/banners");
  redirect("/admin/banners?hero=deleted");
}

const displaySchema = z.object({
  hero_bg_enabled: z.enum(["0", "1"]),
  hero_bg_overlay: z.enum(["light", "medium", "strong"]),
  hero_bg_animate: z.enum(["0", "1"]),
  hero_bg_seconds: z.enum(["5", "7", "10", "15"]),
  banners_enabled: z.enum(["0", "1"]),
  banners_autoplay: z.enum(["0", "1"]),
  banners_effect: z.enum(["slide", "fade"]),
  banners_seconds: z.enum(["4", "6", "8", "12"]),
});

/** Show / hide the background and the offers section, and how strong the veil over the background is */
export async function saveHomeDisplay(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("appearance");
  const parsed = displaySchema.safeParse({
    hero_bg_enabled: formData.get("hero_bg_enabled") === "on" ? "1" : "0",
    hero_bg_overlay: formData.get("hero_bg_overlay") ?? "light",
    banners_enabled: formData.get("banners_enabled") === "on" ? "1" : "0",
    hero_bg_animate: formData.get("hero_bg_animate") === "on" ? "1" : "0",
    hero_bg_seconds: formData.get("hero_bg_seconds") ?? "7",
    banners_autoplay: formData.get("banners_autoplay") === "on" ? "1" : "0",
    banners_effect: formData.get("banners_effect") ?? "slide",
    banners_seconds: formData.get("banners_seconds") ?? "6",
  });
  if (!parsed.success) return { error: "تحقق من الاختيارات." };
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(parsed.data)) {
      await tx.insert(s.settings).values({ key, value }).onConflictDoUpdate({ target: s.settings.key, set: { value } });
    }
  });
  invalidateCatalogCache();
  revalidatePath("/admin/banners");
  return { ok: true, message: "تم الحفظ. التغيير يظهر في الصفحة الرئيسية فورًا." };
}
