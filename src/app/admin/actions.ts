"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db, schema as s } from "@/db";
import {
  clearLoginFailures,
  createSession,
  destroySession,
  loginThrottled,
  recordLoginFailure,
  requireAdmin,
  requireSection,
} from "@/lib/auth";
import { SETTING_KEYS } from "@/lib/settings-keys";
import { normalizePhone } from "@/lib/phone";
import { requestRating } from "@/lib/trip-messages";
import { invalidateCatalogCache } from "@/lib/catalog";
import { cancelPaidBooking, requestRefund } from "@/lib/cancellation";
import { REGIONS, type RegionSlug } from "@/lib/regions";
import { driveMinutes, roadKm } from "@/lib/pricing";
import { CORNERS, FONTS, parseTheme, themeWarnings, type CornerKey, type FontKey } from "@/lib/theme";

export type ActionState = { ok?: boolean; error?: string; message?: string };

// Compared against when the email doesn't exist, so timing doesn't reveal valid emails
let dummyHash: string | null = null;

/* ---------- Auth ---------- */

export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const typed = String(formData.get("email") ?? "").trim().toLowerCase();
  // drivers may sign in with their mobile number in any common form
  const email = typed.includes("@") ? typed : (normalizePhone(typed) ?? typed);
  const password = String(formData.get("password") ?? "");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = `${ip}:${email}`;

  if (loginThrottled(key)) return { error: "محاولات كثيرة. انتظر ١٥ دقيقة ثم حاول مرة أخرى." };

  const user = email ? await db.query.adminUsers.findFirst({ where: eq(s.adminUsers.email, email) }) : undefined;
  // Always run bcrypt so response time doesn't reveal whether the email exists
  dummyHash ??= await bcrypt.hash("not-a-real-password", 12);
  const ok = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);
  if (!user || !ok) {
    recordLoginFailure(key);
    return { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." };
  }
  if (!user.active) {
    // a driver who applied from the website, with the right password: tell them where the application stands
    const d = user.role === "driver" && user.driverId ? await db.query.drivers.findFirst({ where: eq(s.drivers.id, user.driverId) }) : null;
    if (d?.status === "pending") return { error: "طلب انضمامك قيد المراجعة. سنرد عليك على واتساب بعد مراجعته." };
    if (d?.status === "rejected") return { error: `لم يُقبل طلب انضمامك.${d.rejectReason ? ` السبب: ${d.rejectReason}` : ""} تقدر تقدّم طلبًا جديدًا بعد التعديل.` };
    return { error: "هذا الحساب موقوف. تواصل مع الإدارة." };
  }
  clearLoginFailures(key);
  await createSession({ uid: user.id, email: user.email, name: user.name });
  redirect(user.role === "driver" ? "/admin/my-trips" : "/admin");
}

export async function logout() {
  await destroySession();
  redirect("/admin/login");
}

/* ---------- Bookings ---------- */

const bookingUpdate = z.object({
  id: z.uuid(),
  status: z.enum(s.bookingStatus.enumValues),
  adminNote: z.string().max(2000).default(""),
});

export async function updateBooking(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("bookings");
  const parsed = bookingUpdate.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    adminNote: formData.get("adminNote") ?? "",
  });
  if (!parsed.success) return { error: "بيانات غير صحيحة." };
  const { id, status, adminNote } = parsed.data;

  const current = await db.query.bookings.findFirst({ where: eq(s.bookings.id, id) });
  if (!current) return { error: "الحجز غير موجود." };

  // Only the payment gateway can mark a booking as paid
  if (status === "paid" && current.status !== "paid") return { error: "حالة «تم الدفع» تُضبط تلقائيًا من بوابة الدفع فقط." };
  if (status === "pending_payment" && current.status !== "pending_payment")
    return { error: "لا يمكن إرجاع حجز إلى «بانتظار الدفع»." };
  if (status === "cancelled" && (current.status === "paid" || current.status === "confirmed"))
    return { error: "لإلغاء حجز مدفوع استخدم «إلغاء الحجز والاسترداد» حتى يُحدَّد مبلغ الاسترداد." };
  if (current.status === "cancelled" && status !== "cancelled") return { error: "الحجز الملغي لا يمكن إرجاعه. أنشئ حجزًا جديدًا." };

  const nowCompleted = status === "completed" && current.status !== "completed";
  await db
    .update(s.bookings)
    .set({ status, adminNote: adminNote || null, updatedAt: new Date(), ...(nowCompleted ? { completedAt: new Date() } : {}) })
    .where(eq(s.bookings.id, id));
  // finished trip: ask the customer for a rating on WhatsApp
  if (nowCompleted) await requestRating(id);
  revalidatePath(`/admin/bookings/${current.ref}`);
  revalidatePath("/admin/bookings");
  return { ok: true, message: "تم حفظ التغييرات." };
}

/* ---------- Prices (route x vehicle matrix) ---------- */

/**
 * Form fields: price_<routeId>_<vehicleId> and was_<routeId>_<vehicleId> in SAR.
 * Empty price = vehicle not offered on that route (trip deactivated).
 */
export async function savePrices(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("catalog");
  const toHalalas = (v: FormDataEntryValue | null) => {
    const str = String(v ?? "").trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    if (!str) return null;
    const n = Number(str);
    return Number.isFinite(n) && n >= 1 && n <= 1_000_000 ? Math.round(n * 100) : NaN;
  };

  const cells: { routeId: number; vehicleId: number; price: number | null; was: number | null }[] = [];
  for (const [key, value] of formData.entries()) {
    const m = /^price_(\d+)_(\d+)$/.exec(key);
    if (!m) continue;
    const price = toHalalas(value);
    const was = toHalalas(formData.get(`was_${m[1]}_${m[2]}`));
    if (Number.isNaN(price) || Number.isNaN(was)) return { error: "أحد الأسعار غير صحيح. اكتب رقمًا بالريال مثل 250." };
    cells.push({ routeId: Number(m[1]), vehicleId: Number(m[2]), price, was: was && price && was > price ? was : null });
  }

  await db.transaction(async (tx) => {
    for (const c of cells) {
      if (c.price == null) {
        await tx
          .update(s.trips)
          .set({ active: false })
          .where(and(eq(s.trips.routeId, c.routeId), eq(s.trips.vehicleId, c.vehicleId)));
      } else {
        await tx
          .insert(s.trips)
          .values({ routeId: c.routeId, vehicleId: c.vehicleId, price: c.price, compareAtPrice: c.was, active: true })
          .onConflictDoUpdate({
            target: [s.trips.routeId, s.trips.vehicleId],
            set: { price: c.price, compareAtPrice: c.was, active: true },
          });
      }
    }
  });
  invalidateCatalogCache();
  revalidatePath("/admin/prices");
  return { ok: true, message: "تم حفظ الأسعار. تظهر للعملاء فورًا." };
}

/* ---------- Vehicles ---------- */

const vehicleSchema = z.object({
  id: z.coerce.number().int().optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,60}$/),
  nameAr: z.string().trim().min(2).max(80),
  nameEn: z.string().trim().min(2).max(80),
  category: z.enum(s.vehicleCategory.enumValues),
  passengers: z.coerce.number().int().min(1).max(100),
  bags: z.coerce.number().int().min(0).max(200),
  imageUrl: z.string().trim().max(500).default(""),
  featuresAr: z.string().default(""),
  featuresEn: z.string().default(""),
  sortOrder: z.coerce.number().int().default(0),
  active: z.boolean(),
  baseFare: z.coerce.number().min(0).max(100000),
  perKm: z.coerce.number().min(0).max(1000),
  minFare: z.coerce.number().min(0).max(100000),
  hourly6: z.coerce.number().min(0).max(100000),
  hourly12: z.coerce.number().min(0).max(100000),
  hourly24: z.coerce.number().min(0).max(100000),
});

export async function saveVehicle(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("catalog");
  const raw = Object.fromEntries(formData.entries());
  const parsed = vehicleSchema.safeParse({ ...raw, id: raw.id || undefined, active: raw.active === "on" });
  if (!parsed.success) return { error: "راجع الحقول: الرمز بحروف إنجليزية صغيرة وأرقام وشرطات، والأسماء مطلوبة، وأسعار المسافة أرقام." };
  const d = parsed.data;
  if (d.imageUrl && !/^(https:\/\/|\/)/.test(d.imageUrl)) return { error: "رابط الصورة يجب أن يبدأ بـ https:// أو /" };

  const ar = d.featuresAr.split("\n").map((x) => x.trim()).filter(Boolean);
  const en = d.featuresEn.split("\n").map((x) => x.trim()).filter(Boolean);
  const features = ar.map((a, i) => ({ ar: a, en: en[i] ?? a }));

  const values = {
    slug: d.slug,
    nameAr: d.nameAr,
    nameEn: d.nameEn,
    category: d.category,
    passengers: d.passengers,
    bags: d.bags,
    imageUrl: d.imageUrl || null,
    features,
    sortOrder: d.sortOrder,
    active: d.active,
    baseFare: Math.round(d.baseFare * 100),
    perKm: Math.round(d.perKm * 100),
    minFare: Math.round(d.minFare * 100),
    hourly6: Math.round(d.hourly6 * 100),
    hourly12: Math.round(d.hourly12 * 100),
    hourly24: Math.round(d.hourly24 * 100),
  };
  try {
    if (d.id) await db.update(s.vehicles).set(values).where(eq(s.vehicles.id, d.id));
    else await db.insert(s.vehicles).values(values);
  } catch {
    return { error: "يوجد مركبة أخرى بنفس الرمز." };
  }
  invalidateCatalogCache();
  revalidatePath("/admin/vehicles");
  if (!d.id) redirect("/admin/vehicles");
  return { ok: true, message: "تم الحفظ." };
}

/* ---------- Locations & routes ---------- */

/* ---------- Destinations & cities ---------- */

/** "21.42, 39.82", or a Google Maps link containing @lat,lng / q=lat,lng / !3dlat!4dlng */
function parseCoords(raw: string): { lat: number; lng: number } | null | "invalid" {
  const v = raw.trim();
  if (!v) return null;
  const patterns = [/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/, /[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, /^(-?\d+(?:\.\d+)?)\s*[,،\s]\s*(-?\d+(?:\.\d+)?)$/];
  for (const re of patterns) {
    const m = re.exec(v);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      // Saudi Arabia lies roughly between 16-33 N and 34-56 E
      if (lat >= 15 && lat <= 33 && lng >= 34 && lng <= 56) return { lat, lng };
      return "invalid";
    }
  }
  return "invalid";
}

function slugify(v: string) {
  return v
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

async function uniqueSlug(table: typeof s.locations | typeof s.cities, base: string) {
  let slug = base || "place";
  for (let i = 2; (await db.select({ id: table.id }).from(table).where(eq(table.slug, slug)).limit(1)).length; i++) slug = `${base}-${i}`;
  return slug;
}

const locationSchema = z.object({
  id: z.coerce.number().int().optional(),
  nameAr: z.string().trim().min(2).max(120),
  nameEn: z.string().trim().min(2).max(120),
  city: z.string().trim().min(1).max(60),
  kind: z.enum(s.locationKind.enumValues),
  coords: z.string().max(2000).default(""),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
  active: z.boolean(),
});

export async function saveLocation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("catalog");
  const raw = Object.fromEntries(formData.entries());
  const parsed = locationSchema.safeParse({ ...raw, id: raw.id || undefined, active: raw.active === "on" });
  if (!parsed.success) return { error: "اكتب اسم الوجهة بالعربي والإنجليزي واختر المدينة." };
  const d = parsed.data;
  const [city] = await db.select().from(s.cities).where(eq(s.cities.slug, d.city)).limit(1);
  if (!city) return { error: "المدينة غير موجودة. أضفها أولًا من قسم المدن." };
  const coords = parseCoords(d.coords);
  if (coords === "invalid") return { error: "الإحداثيات غير صحيحة. الصق رابط خرائط جوجل للمكان، أو اكتبها هكذا: 21.4225, 39.8262" };
  // no coordinates: use the city's, so distance pricing still works
  const point = coords ?? { lat: city.lat, lng: city.lng };

  const values = { nameAr: d.nameAr, nameEn: d.nameEn, city: d.city, kind: d.kind, lat: point.lat, lng: point.lng, sortOrder: d.sortOrder, active: d.active };
  if (d.id) {
    const updated = await db.update(s.locations).set(values).where(eq(s.locations.id, d.id)).returning({ id: s.locations.id });
    if (!updated.length) return { error: "الوجهة غير موجودة." };
  } else {
    const slug = await uniqueSlug(s.locations, slugify(d.nameEn));
    await db.insert(s.locations).values({ ...values, slug });
  }
  invalidateCatalogCache();
  revalidatePath("/admin/destinations");
  if (!d.id) redirect(`/admin/destinations?city=${encodeURIComponent(d.city)}&added=1`);
  return { ok: true, message: coords ? "تم الحفظ." : "تم الحفظ. لم تُحدَّد إحداثيات، فاستُخدم موقع المدينة لحساب المسافة." };
}

export async function deleteLocation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("catalog");
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { error: "بيانات غير صحيحة." };
  const used = await db
    .select({ id: s.routes.id })
    .from(s.routes)
    .where(or(eq(s.routes.fromLocationId, id), eq(s.routes.toLocationId, id)))
    .limit(1);
  if (used.length) return { error: "هذه الوجهة مستخدمة في رحلة بسعر ثابت. أخفِها بدلًا من حذفها، أو احذف الرحلة أولًا." };
  await db.delete(s.locations).where(eq(s.locations.id, id));
  invalidateCatalogCache();
  revalidatePath("/admin/destinations");
  redirect("/admin/destinations?deleted=1");
}

const citySchema = z.object({
  nameAr: z.string().trim().min(2).max(80),
  nameEn: z.string().trim().min(2).max(80),
  region: z.enum(REGIONS.map((r) => r.slug) as [RegionSlug, ...RegionSlug[]]),
  coords: z.string().max(2000).default(""),
  addStop: z.boolean(),
});

export async function addCity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("catalog");
  const raw = Object.fromEntries(formData.entries());
  const parsed = citySchema.safeParse({ ...raw, addStop: raw.addStop === "on" });
  if (!parsed.success) return { error: "اكتب اسم المدينة بالعربي والإنجليزي واختر المنطقة." };
  const d = parsed.data;
  const coords = parseCoords(d.coords);
  if (coords === null) return { error: "حدّد موقع المدينة: الصق رابط خرائط جوجل أو اكتب الإحداثيات." };
  if (coords === "invalid") return { error: "الإحداثيات غير صحيحة. الصق رابط خرائط جوجل للمدينة، أو اكتبها هكذا: 24.7136, 46.6753" };
  const slug = await uniqueSlug(s.cities, slugify(d.nameEn));
  await db.insert(s.cities).values({ slug, nameAr: d.nameAr, nameEn: d.nameEn, region: d.region, lat: coords.lat, lng: coords.lng, sortOrder: 5000 });
  if (d.addStop) {
    const stopSlug = await uniqueSlug(s.locations, slug);
    await db.insert(s.locations).values({
      slug: stopSlug,
      nameAr: `${d.nameAr} (داخل المدينة)`,
      nameEn: `${d.nameEn} (in the city)`,
      city: slug,
      kind: "city",
      lat: coords.lat,
      lng: coords.lng,
      sortOrder: 5000,
    });
  }
  invalidateCatalogCache();
  revalidatePath("/admin/destinations");
  return { ok: true, message: d.addStop ? "تمت إضافة المدينة ووجهة «داخل المدينة» لها." : "تمت إضافة المدينة." };
}

export async function toggleCity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("catalog");
  const slug = String(formData.get("slug") ?? "");
  const active = formData.get("active") === "1";
  await db.update(s.cities).set({ active }).where(eq(s.cities.slug, slug));
  // hiding a city hides its destinations from customers too
  await db.update(s.locations).set({ active }).where(eq(s.locations.city, slug));
  invalidateCatalogCache();
  revalidatePath("/admin/destinations");
  return { ok: true, message: active ? "تم إظهار المدينة ووجهاتها." : "تم إخفاء المدينة ووجهاتها عن العملاء." };
}

const routeSchema = z.object({
  id: z.coerce.number().int().optional(),
  kind: z.enum(s.routeKind.enumValues),
  fromLocationId: z.coerce.number().int().positive(),
  toLocationId: z.coerce.number().int().positive().optional(),
  distanceKm: z.coerce.number().int().min(0).max(3000).optional(),
  durationMin: z.coerce.number().int().min(0).max(3000).optional(),
  titleAr: z.string().trim().max(150).default(""),
  titleEn: z.string().trim().max(150).default(""),
  sortOrder: z.coerce.number().int().default(0),
  active: z.boolean(),
  bidirectional: z.boolean(),
});

export async function saveRoute(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("catalog");
  const raw = Object.fromEntries(formData.entries());
  const blank = (v: FormDataEntryValue | undefined) => (v === "" || v == null ? undefined : v);
  const parsed = routeSchema.safeParse({
    ...raw,
    id: blank(raw.id),
    toLocationId: blank(raw.toLocationId),
    distanceKm: blank(raw.distanceKm),
    durationMin: blank(raw.durationMin),
    active: raw.active === "on",
    bidirectional: raw.bidirectional === "on",
  });
  if (!parsed.success) return { error: "راجع الحقول." };
  const d = parsed.data;
  if (d.kind === "transfer" && !d.toLocationId) return { error: "رحلة التوصيل تحتاج نقطة وصول." };
  if (d.kind === "transfer" && d.toLocationId === d.fromLocationId) return { error: "نقطة الانطلاق والوصول متطابقتان." };
  if (d.kind === "ziyarat" && !d.titleAr) return { error: "اكتب اسم الجولة بالعربي." };

  const locs = await db.select().from(s.locations).where(inArray(s.locations.id, [d.fromLocationId, d.toLocationId ?? d.fromLocationId]));
  const from = locs.find((l) => l.id === d.fromLocationId);
  const to = locs.find((l) => l.id === d.toLocationId);
  if (!from || (d.kind === "transfer" && !to)) return { error: "الموقع غير موجود." };

  const values = {
    kind: d.kind,
    fromLocationId: d.fromLocationId,
    toLocationId: d.kind === "transfer" ? d.toLocationId! : null,
    bidirectional: d.kind === "transfer" && d.bidirectional,
    distanceKm: d.distanceKm ?? null,
    durationMin: d.durationMin ?? null,
    titleAr: d.titleAr || null,
    titleEn: d.titleEn || null,
    sortOrder: d.sortOrder,
    active: d.active,
  };

  if (d.id) {
    await db.update(s.routes).set(values).where(eq(s.routes.id, d.id));
  } else {
    const base = d.kind === "transfer" ? `${from.slug}-${to!.slug}` : `${from.slug}-ziyarat`;
    let slug = base;
    for (let i = 2; await db.query.routes.findFirst({ where: eq(s.routes.slug, slug) }); i++) slug = `${base}-${i}`;
    await db.insert(s.routes).values({ ...values, slug });
  }
  invalidateCatalogCache();
  revalidatePath("/admin/routes");
  return { ok: true, message: d.id ? "تم الحفظ." : "تمت إضافة الرحلة. أضف أسعارها من صفحة الأسعار." };
}

/**
 * Prices page: add a route between two destinations together with its price per car.
 * Empty prices can be filled from the distance (each car's distance rates), rounded to 10 SAR.
 */
export async function addPricedRoute(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("catalog");
  const fromId = Number(formData.get("fromLocationId") ?? 0);
  const toId = Number(formData.get("toLocationId") ?? 0);
  if (!fromId || !toId) return { error: "اختر نقطة الانطلاق والوجهة." };
  if (fromId === toId) return { error: "نقطة الانطلاق والوجهة متطابقتان." };
  const locs = await db.select().from(s.locations).where(inArray(s.locations.id, [fromId, toId]));
  const from = locs.find((l) => l.id === fromId);
  const to = locs.find((l) => l.id === toId);
  if (!from || !to) return { error: "الوجهة غير موجودة." };

  const num = (v: FormDataEntryValue | null) => {
    const str = String(v ?? "").trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    if (!str) return null;
    const n = Number(str);
    return Number.isFinite(n) && n > 0 ? n : NaN;
  };
  const typedKm = num(formData.get("distanceKm"));
  if (Number.isNaN(typedKm) || (typedKm != null && typedKm > 3000)) return { error: "المسافة غير صحيحة (بالكيلومتر)." };
  const km = typedKm != null ? Math.round(typedKm) : roadKm(from, to);
  const autoFill = formData.get("autoFill") === "on";

  const vehicles = await db.select().from(s.vehicles);
  const prices: { vehicleId: number; price: number }[] = [];
  for (const v of vehicles) {
    const p = num(formData.get(`newprice_${v.id}`));
    if (Number.isNaN(p) || (p != null && p > 1_000_000)) return { error: `سعر ${v.nameAr} غير صحيح. اكتب رقمًا بالريال مثل 250.` };
    if (p != null) prices.push({ vehicleId: v.id, price: Math.round(p * 100) });
    else if (autoFill && km && v.active)
      prices.push({ vehicleId: v.id, price: Math.ceil(Math.max(v.minFare, v.baseFare + v.perKm * km) / 1000) * 1000 });
  }
  if (!prices.length)
    return { error: km ? "اكتب سعرًا لسيارة واحدة على الأقل، أو فعّل «املأ الأسعار الفارغة حسب المسافة»." : "اكتب سعرًا لسيارة واحدة على الأقل (لا توجد إحداثيات لحساب المسافة)." };

  const [existing] = await db
    .select({ id: s.routes.id })
    .from(s.routes)
    .where(
      and(
        eq(s.routes.kind, "transfer"),
        or(
          and(eq(s.routes.fromLocationId, fromId), eq(s.routes.toLocationId, toId)),
          and(eq(s.routes.fromLocationId, toId), eq(s.routes.toLocationId, fromId)),
        ),
      ),
    )
    .limit(1);
  if (existing) return { error: "توجد رحلة بين هاتين الوجهتين من قبل. عدّل أسعارها من الجدول بالأسفل." };

  const base = `${from.slug}-${to.slug}`;
  let slug = base;
  for (let i = 2; await db.query.routes.findFirst({ where: eq(s.routes.slug, slug) }); i++) slug = `${base}-${i}`;
  await db.transaction(async (tx) => {
    const [r] = await tx
      .insert(s.routes)
      .values({
        slug,
        kind: "transfer",
        fromLocationId: fromId,
        toLocationId: toId,
        bidirectional: formData.get("bidirectional") === "on",
        distanceKm: km ?? null,
        durationMin: km ? driveMinutes(km) : null,
        active: true,
      })
      .returning({ id: s.routes.id });
    await tx.insert(s.trips).values(prices.map((p) => ({ routeId: r.id, vehicleId: p.vehicleId, price: p.price, active: true })));
  });
  invalidateCatalogCache();
  redirect(`/admin/prices?added=${encodeURIComponent(slug)}`);
}

/* ---------- Settings ---------- */

export async function saveSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("settings");
  const rows = SETTING_KEYS.map((key) => ({ key, value: String(formData.get(key) ?? "").trim().slice(0, 500) }));
  await db.transaction(async (tx) => {
    for (const r of rows) {
      await tx.insert(s.settings).values(r).onConflictDoUpdate({ target: s.settings.key, set: { value: r.value } });
    }
  });
  invalidateCatalogCache();
  revalidatePath("/admin/settings");
  return { ok: true, message: "تم حفظ الإعدادات." };
}

/* ---------- VAT & pricing ---------- */

const pricingSchema = z.object({
  vat_rate: z.coerce.number().min(0).max(100),
  vat_number: z
    .string()
    .trim()
    .regex(/^(\d{15})?$/),
  prices_include_vat: z.enum(["0", "1"]),
  distance_pricing: z.enum(["0", "1"]),
});

export async function savePricingSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("settings");
  const raw = Object.fromEntries(formData.entries());
  const parsed = pricingSchema.safeParse({
    ...raw,
    vat_rate: String(raw.vat_rate ?? "").replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))),
    vat_number: String(raw.vat_number ?? "").replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/\s/g, ""),
    prices_include_vat: raw.prices_include_vat === "on" ? "1" : "0",
    distance_pricing: raw.distance_pricing === "on" ? "1" : "0",
  });
  if (!parsed.success) {
    const f = parsed.error.issues[0]?.path[0];
    if (f === "vat_number") return { error: "الرقم الضريبي ١٥ رقمًا، أو اتركه فارغًا." };
    return { error: "نسبة الضريبة رقم بين ٠ و ١٠٠." };
  }
  const d = parsed.data;
  const rows = { vat_rate: String(d.vat_rate), vat_number: d.vat_number, prices_include_vat: d.prices_include_vat, distance_pricing: d.distance_pricing };
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(rows)) {
      await tx.insert(s.settings).values({ key, value }).onConflictDoUpdate({ target: s.settings.key, set: { value } });
    }
  });
  invalidateCatalogCache();
  revalidatePath("/admin/settings");
  return { ok: true, message: "تم الحفظ. الحجوزات الجديدة تُحسب بهذه الإعدادات، والحجوزات السابقة لا تتغير." };
}

/* ---------- Account ---------- */

export async function changePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (next.length < 10) return { error: "كلمة المرور الجديدة يجب أن تكون ١٠ أحرف على الأقل." };
  const user = await db.query.adminUsers.findFirst({ where: eq(s.adminUsers.id, session.uid) });
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) return { error: "كلمة المرور الحالية غير صحيحة." };
  await db.update(s.adminUsers).set({ passwordHash: await bcrypt.hash(next, 12) }).where(eq(s.adminUsers.id, user.id));
  return { ok: true, message: "تم تغيير كلمة المرور." };
}

/* ---------- Appearance ---------- */

const appearanceSchema = z.object({
  company_name_ar: z.string().trim().min(2).max(80),
  company_name_en: z.string().trim().min(2).max(80),
  logo_text_ar: z.string().trim().max(14),
  logo_text_en: z.string().trim().max(14),
  hero_title_ar: z.string().trim().max(120),
  hero_title_en: z.string().trim().max(120),
  hero_lead_ar: z.string().trim().max(300),
  hero_lead_en: z.string().trim().max(300),
  preset: z.string().max(40),
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  font: z.enum(Object.keys(FONTS) as [FontKey, ...FontKey[]]),
  corners: z.enum(Object.keys(CORNERS) as [CornerKey, ...CornerKey[]]),
});

export async function saveAppearance(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("appearance");
  const parsed = appearanceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "");
    if (field.startsWith("company_name")) return { error: "اكتب اسم الشركة بالعربي والإنجليزي." };
    if (field.startsWith("logo_text")) return { error: "نص الشعار ١٤ حرفًا كحد أقصى." };
    return { error: "راجع الحقول: الألوان بصيغة ‎#RRGGBB‎." };
  }
  const d = parsed.data;
  const theme = { preset: d.preset, primary: d.primary.toLowerCase(), accent: d.accent.toLowerCase(), background: d.background.toLowerCase(), font: d.font, corners: d.corners };
  const rows: Record<string, string> = {
    company_name_ar: d.company_name_ar,
    company_name_en: d.company_name_en,
    logo_text_ar: d.logo_text_ar,
    logo_text_en: d.logo_text_en,
    hero_title_ar: d.hero_title_ar,
    hero_title_en: d.hero_title_en,
    hero_lead_ar: d.hero_lead_ar,
    hero_lead_en: d.hero_lead_en,
    theme: JSON.stringify(theme),
  };
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(rows)) {
      await tx.insert(s.settings).values({ key, value }).onConflictDoUpdate({ target: s.settings.key, set: { value } });
    }
  });
  invalidateCatalogCache();
  revalidatePath("/admin/appearance");
  const warnings = themeWarnings(parseTheme(rows.theme));
  return { ok: true, message: warnings.length ? `تم الحفظ. تنبيه: ${warnings[0]}` : "تم حفظ المظهر. افتح الموقع لترى التغيير." };
}

const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

/** Check the file's first bytes, not just the type the browser claims */
function sniffImage(buf: Buffer, mime: string) {
  if (mime === "image/png") return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === "image/jpeg") return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === "image/webp") return buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
  if (mime === "image/svg+xml") {
    const head = buf.subarray(0, 2048).toString("utf8").toLowerCase();
    return head.includes("<svg") && !head.includes("<script") && !/\son\w+\s*=/.test(buf.toString("utf8").toLowerCase());
  }
  return false;
}

export async function uploadLogo(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("appearance");
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { error: "اختر ملف الشعار أولًا." };
  if (file.size > 1024 * 1024) return { error: "حجم الشعار أكبر من ١ ميجابايت. صغّر الصورة ثم حاول مرة أخرى." };
  if (!LOGO_TYPES[file.type]) return { error: "نوع الملف غير مدعوم. استخدم PNG أو JPG أو WEBP أو SVG." };
  const buf = Buffer.from(await file.arrayBuffer());
  if (!sniffImage(buf, file.type)) return { error: "الملف لا يبدو صورة صالحة من النوع المختار، أو يحتوي على نصوص برمجية." };
  await db
    .insert(s.assets)
    .values({ key: "logo", mime: file.type, data: buf, updatedAt: new Date() })
    .onConflictDoUpdate({ target: s.assets.key, set: { mime: file.type, data: buf, updatedAt: new Date() } });
  invalidateCatalogCache();
  revalidatePath("/admin/appearance");
  return { ok: true, message: "تم رفع الشعار." };
}

export async function removeLogo(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  await requireSection("appearance");
  await db.delete(s.assets).where(eq(s.assets.key, "logo"));
  invalidateCatalogCache();
  revalidatePath("/admin/appearance");
  return { ok: true, message: "تم حذف الشعار. سيظهر شعار النص بدلًا منه." };
}

/* ---------- Cancellation & refunds ---------- */

const toHalalasInput = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/٫/g, "."));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

/** Admin cancels a paid booking and decides the refund amount */
export async function adminCancelWithRefund(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("bookings");
  const id = String(formData.get("id") ?? "");
  const b = await db.query.bookings.findFirst({ where: eq(s.bookings.id, id) });
  if (!b) return { error: "الحجز غير موجود." };
  const amount = toHalalasInput(formData.get("refund"));
  if (Number.isNaN(amount) || amount < 0 || amount > b.amount) return { error: `مبلغ الاسترداد يجب أن يكون بين ٠ و ${b.amount / 100} ريال.` };
  const sendNow = formData.get("sendNow") === "on";
  const done = await cancelPaidBooking(b.id, "admin", amount, sendNow);
  if (!done) return { error: "لا يمكن إلغاء هذا الحجز بهذه الطريقة: هو ليس مدفوعًا أو مؤكدًا." };
  revalidatePath(`/admin/bookings/${b.ref}`);
  if (done.refundStatus === "failed") return { error: `تم الإلغاء، لكن طلب الاسترداد فشل: ${done.refundError ?? ""}` };
  return { ok: true, message: amount === 0 ? "تم إلغاء الحجز بدون استرداد." : done.paymentMethod === "bank_transfer" ? "تم الإلغاء. حوّل المبلغ للعميل ثم اضغط «تم الاسترداد يدويًا»." : sendNow ? "تم الإلغاء وإرسال طلب الاسترداد إلى ماي فاتورة." : "تم الإلغاء. الاسترداد بانتظار موافقتك." };
}

/** Send a pending (or failed) refund to MyFatoorah */
export async function approveRefund(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("bookings");
  const id = String(formData.get("id") ?? "");
  const b = await requestRefund(id);
  if (!b) return { error: "الحجز غير موجود." };
  if (b.paymentMethod === "bank_transfer") return { error: "هذا الحجز مدفوع بتحويل بنكي: حوّل المبلغ للعميل من حسابك ثم اضغط «تم الاسترداد يدويًا»." };
  revalidatePath(`/admin/bookings/${b.ref}`);
  revalidatePath("/admin");
  if (b.refundStatus === "failed") return { error: `فشل طلب الاسترداد: ${b.refundError ?? ""}` };
  return { ok: true, message: `أُرسل طلب الاسترداد إلى ماي فاتورة. المرجع: ${b.refundReference ?? "—"}` };
}

/** The refund was handled outside the system (bank transfer, cash...) */
export async function markRefundManual(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("bookings");
  const id = String(formData.get("id") ?? "");
  const [b] = await db
    .update(s.bookings)
    .set({ refundStatus: "manual", refundError: null, updatedAt: new Date() })
    .where(and(eq(s.bookings.id, id), inArray(s.bookings.refundStatus, ["pending_approval", "failed"])))
    .returning();
  if (!b) return { error: "لا يوجد استرداد معلّق لهذا الحجز." };
  revalidatePath(`/admin/bookings/${b.ref}`);
  revalidatePath("/admin");
  return { ok: true, message: "تم تسجيل الاسترداد كمُعالَج يدويًا." };
}

/* ---------- Hourly & cancellation settings ---------- */

const policySchema = z.object({
  hourly_enabled: z.enum(["0", "1"]),
  cancel_enabled: z.enum(["0", "1"]),
  cancel_full_hours: z.coerce.number().int().min(0).max(720),
  cancel_partial_percent: z.coerce.number().int().min(0).max(100),
  refund_auto: z.enum(["0", "1"]),
});

export async function savePolicySettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("settings");
  const raw = Object.fromEntries(formData.entries());
  const digits = (v: FormDataEntryValue | undefined) => String(v ?? "").replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)));
  const parsed = policySchema.safeParse({
    hourly_enabled: raw.hourly_enabled === "on" ? "1" : "0",
    cancel_enabled: raw.cancel_enabled === "on" ? "1" : "0",
    refund_auto: raw.refund_auto === "on" ? "1" : "0",
    cancel_full_hours: digits(raw.cancel_full_hours),
    cancel_partial_percent: digits(raw.cancel_partial_percent),
  });
  if (!parsed.success) return { error: "الساعات رقم بين ٠ و ٧٢٠، والنسبة رقم بين ٠ و ١٠٠." };
  await db.transaction(async (tx) => {
    for (const [key, v] of Object.entries(parsed.data)) {
      const value = String(v);
      await tx.insert(s.settings).values({ key, value }).onConflictDoUpdate({ target: s.settings.key, set: { value } });
    }
  });
  invalidateCatalogCache();
  revalidatePath("/admin/settings");
  return { ok: true, message: "تم حفظ سياسة الإلغاء والحجز بالساعة." };
}

/* ---------- Destinations: quick and bulk hide / show / delete ---------- */

export async function bulkLocations(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("catalog");
  const op = String(formData.get("op") ?? "");
  const m = /^(hide|show|delete)(?::(\d+))?$/.exec(op);
  if (!m) return { error: "عملية غير معروفة." };
  const action = m[1] as "hide" | "show" | "delete";
  const ids = (m[2] ? [m[2]] : formData.getAll("ids").map(String))
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 500);
  if (!ids.length) return { error: "حدّد وجهة واحدة على الأقل." };

  if (action !== "delete") {
    const changed = await db
      .update(s.locations)
      .set({ active: action === "show" })
      .where(inArray(s.locations.id, ids))
      .returning({ id: s.locations.id });
    invalidateCatalogCache();
    revalidatePath("/admin/destinations");
    const n = changed.length;
    return { ok: true, message: action === "hide" ? `تم إخفاء ${n} وجهة عن العملاء.` : `تم إظهار ${n} وجهة للعملاء.` };
  }

  // destinations used by fixed-price routes are kept (hide them instead)
  const used = await db
    .select({ from: s.routes.fromLocationId, to: s.routes.toLocationId })
    .from(s.routes)
    .where(or(inArray(s.routes.fromLocationId, ids), inArray(s.routes.toLocationId, ids)));
  const usedIds = new Set(used.flatMap((r) => [r.from, r.to]).filter((x): x is number => x != null));
  const deletable = ids.filter((id) => !usedIds.has(id));
  const deleted = deletable.length
    ? await db.delete(s.locations).where(inArray(s.locations.id, deletable)).returning({ id: s.locations.id })
    : [];
  invalidateCatalogCache();
  revalidatePath("/admin/destinations");
  const kept = ids.filter((id) => usedIds.has(id)).length;
  if (!deleted.length) return { error: "لم يُحذف شيء: الوجهات المحددة مستخدمة في رحلات بسعر ثابت. أخفِها بدلًا من حذفها." };
  return {
    ok: true,
    message: kept ? `تم حذف ${deleted.length} وجهة. بقيت ${kept} لأنها مستخدمة في رحلات ثابتة (يمكنك إخفاؤها).` : `تم حذف ${deleted.length} وجهة.`,
  };
}

/* ---------- Bank transfer ---------- */

/** Admin saw the money arrive in the bank account: mark the booking paid */
export async function confirmBankTransfer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireSection("bookings");
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 200);
  const b = await db.query.bookings.findFirst({ where: eq(s.bookings.id, id) });
  if (!b) return { error: "الحجز غير موجود." };
  const paymentId = `BT-${b.ref}`;
  const done = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(s.bookings)
      .set({ status: "paid", paymentMethod: "bank_transfer", paymentId, paidAt: new Date(), updatedAt: new Date() })
      .where(and(eq(s.bookings.id, b.id), eq(s.bookings.status, "pending_payment"), isNull(s.bookings.paymentId)))
      .returning();
    if (!row) return null;
    await tx.insert(s.payments).values({
      id: paymentId,
      bookingId: row.id,
      status: "paid",
      amount: row.amount,
      currency: row.currency,
      source: "bank_transfer",
      raw: { confirmedBy: admin.email, note, at: new Date().toISOString() },
    });
    return row;
  });
  if (!done) return { error: "لا يمكن تأكيد التحويل: الحجز ليس بانتظار الدفع (ربما دُفع أو أُلغي)." };
  revalidatePath(`/admin/bookings/${b.ref}`);
  revalidatePath("/admin");
  return { ok: true, message: "تم تأكيد استلام التحويل. الحجز الآن مدفوع." };
}

const bankSchema = z.object({
  bank_enabled: z.enum(["0", "1"]),
  bank_name: z.string().trim().max(100),
  bank_account_name: z.string().trim().max(150),
  bank_iban: z.string().trim().max(40),
});

export async function saveBankSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("settings");
  const raw = Object.fromEntries(formData.entries());
  const iban = String(raw.bank_iban ?? "").replace(/\s/g, "").toUpperCase();
  const parsed = bankSchema.safeParse({
    bank_enabled: raw.bank_enabled === "on" ? "1" : "0",
    bank_name: raw.bank_name ?? "",
    bank_account_name: raw.bank_account_name ?? "",
    bank_iban: iban,
  });
  if (!parsed.success) return { error: "تحقق من البيانات." };
  const d = parsed.data;
  if (d.bank_iban && !/^SA\d{22}$/.test(d.bank_iban)) return { error: "رقم الآيبان السعودي يبدأ بـ SA ثم ٢٢ رقمًا." };
  if (d.bank_enabled === "1" && (!d.bank_iban || !d.bank_name || !d.bank_account_name))
    return { error: "لتفعيل التحويل البنكي اكتب اسم البنك واسم صاحب الحساب والآيبان." };
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(d)) {
      await tx.insert(s.settings).values({ key, value }).onConflictDoUpdate({ target: s.settings.key, set: { value } });
    }
  });
  invalidateCatalogCache();
  revalidatePath("/admin/settings");
  return { ok: true, message: "تم حفظ بيانات التحويل البنكي." };
}
