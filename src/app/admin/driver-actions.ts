"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireDriver, requireSection } from "@/lib/auth";
import { detectFile, IMAGE_TYPES } from "@/lib/files";
import { DRIVER_PHOTO_MAX, modelYears } from "@/lib/driver-docs";
import { notify } from "@/lib/notify";
import { publicBaseUrl } from "@/lib/public-url";
import { normalizePhone } from "@/lib/phone";
import { requestRating, sendDriverAssigned } from "@/lib/trip-messages";
import type { ActionState } from "./actions";

const driverSchema = z.object({
  name: z.string().trim().min(2).max(80),
  plateNumber: z.string().trim().min(2).max(30),
  vehicleId: z.coerce.number().int().positive(),
  carModel: z.string().refine((y) => y === "" || modelYears().includes(y)),
  carColor: z.string().trim().max(30),
  notes: z.string().trim().max(500),
  active: z.boolean(),
});

/** Add a driver or edit one (new photo optional) */
export async function saveDriver(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("drivers");
  const id = Number(formData.get("id") ?? 0);
  const parsed = driverSchema.safeParse({
    name: formData.get("name") ?? "",
    plateNumber: formData.get("plateNumber") ?? "",
    vehicleId: formData.get("vehicleId") ?? "",
    carModel: formData.get("carModel") ?? "",
    carColor: formData.get("carColor") ?? "",
    notes: formData.get("notes") ?? "",
    active: formData.get("active") === "on",
  });
  if (!parsed.success) {
    const f = parsed.error.issues[0]?.path[0];
    return { error: f === "plateNumber" ? "اكتب رقم اللوحة." : f === "vehicleId" ? "اختر نوع السيارة." : f === "carModel" ? "اختر الموديل." : "اكتب اسم السائق." };
  }
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (!phone) return { error: "رقم جوال السائق غير صحيح. اكتبه مثل 0501234567 أو مع رمز الدولة." };
  const vehicle = await db.query.vehicles.findFirst({ where: eq(s.vehicles.id, parsed.data.vehicleId) });
  if (!vehicle) return { error: "اختر نوع السيارة." };

  let photo: { photo: Buffer; photoMime: string } | null = null;
  const file = formData.get("photo");
  if (file instanceof File && file.size > 0) {
    if (file.size > DRIVER_PHOTO_MAX) return { error: "حجم الصورة أكبر من ١ ميجابايت." };
    const buf = Buffer.from(await file.arrayBuffer());
    const kind = detectFile(buf, IMAGE_TYPES);
    if (!kind) return { error: "الصورة يجب أن تكون PNG أو JPG أو WEBP." };
    photo = { photo: buf, photoMime: kind.mime };
  }
  const values = { ...parsed.data, carType: vehicle.nameAr, phone, updatedAt: new Date(), ...(photo ?? {}) };
  if (id > 0) {
    const done = await db.update(s.drivers).set(values).where(eq(s.drivers.id, id)).returning({ id: s.drivers.id });
    if (!done.length) return { error: "السائق غير موجود." };
    revalidatePath("/admin/drivers");
    return { ok: true, message: "تم حفظ بيانات السائق." };
  }
  await db.insert(s.drivers).values(values);
  redirect("/admin/drivers?added=1");
}

export async function deleteDriver(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("drivers");
  const id = Number(formData.get("id") ?? 0);
  const upcoming = await db
    .select({ ref: s.bookings.ref })
    .from(s.bookings)
    .where(and(eq(s.bookings.driverId, id), inArray(s.bookings.status, ["paid", "confirmed"])))
    .limit(1);
  if (upcoming.length) return { error: `لهذا السائق رحلة لم تنتهِ (${upcoming[0].ref}). أسندها لسائق آخر أولًا، أو أوقف السائق بدل حذفه.` };
  await db.delete(s.drivers).where(eq(s.drivers.id, id));
  redirect("/admin/drivers?deleted=1");
}

export async function removeDriverPhoto(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("drivers");
  await db
    .update(s.drivers)
    .set({ photo: null, photoMime: null, updatedAt: new Date() })
    .where(eq(s.drivers.id, Number(formData.get("id") ?? 0)));
  revalidatePath("/admin/drivers");
  return { ok: true, message: "تم حذف الصورة." };
}

/* ---------- Applications from the website ---------- */

/** Approve: the driver can sign in and be given trips; told on WhatsApp */
export async function approveDriver(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("drivers");
  const id = Number(formData.get("id") ?? 0);
  const [d] = await db
    .update(s.drivers)
    .set({ status: "approved", active: true, rejectReason: null, updatedAt: new Date() })
    .where(and(eq(s.drivers.id, id), inArray(s.drivers.status, ["pending", "rejected"])))
    .returning();
  if (!d) return { error: "الطلب غير موجود أو رُوجع من قبل." };
  await db.update(s.adminUsers).set({ active: true }).where(and(eq(s.adminUsers.driverId, d.id), eq(s.adminUsers.role, "driver")));
  const login = `${await publicBaseUrl()}/admin/login`;
  await notify({
    channel: "whatsapp",
    kind: "driver_approved",
    recipient: d.phone,
    recipientName: d.name,
    body: `مرحبًا ${d.name}، تم قبول طلب انضمامك كسائق.\nادخل من هنا برقم جوالك وكلمة المرور التي اخترتها لترى رحلاتك:\n${login}`,
    params: [d.name, login],
  });
  redirect(`/admin/drivers?approved=${d.id}`);
}

export async function rejectDriver(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("drivers");
  const id = Number(formData.get("id") ?? 0);
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  const [d] = await db
    .update(s.drivers)
    .set({ status: "rejected", active: false, rejectReason: reason || null, updatedAt: new Date() })
    .where(and(eq(s.drivers.id, id), eq(s.drivers.status, "pending")))
    .returning();
  if (!d) return { error: "الطلب غير موجود أو رُوجع من قبل." };
  await db.update(s.adminUsers).set({ active: false }).where(and(eq(s.adminUsers.driverId, d.id), eq(s.adminUsers.role, "driver")));
  await notify({
    channel: "whatsapp",
    kind: "driver_rejected",
    recipient: d.phone,
    recipientName: d.name,
    body: `مرحبًا ${d.name}، نعتذر، لم يُقبل طلب انضمامك كسائق${reason ? ` (${reason})` : ""}. تقدر تقدّم طلبًا جديدًا بعد التعديل.`,
    params: [d.name, reason || "-"],
  });
  redirect(`/admin/drivers?rejected=${d.id}`);
}

/**
 * Assign (or change) the booking's driver. The driver gets the customer's details and the
 * customer gets the driver's on WhatsApp, automatically.
 */
export async function assignDriver(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("bookings");
  const bookingId = String(formData.get("bookingId") ?? "");
  const driverId = Number(formData.get("driverId") ?? 0);
  if (!z.uuid().safeParse(bookingId).success || !driverId) return { error: "اختر السائق." };
  const [b, d] = await Promise.all([
    db.query.bookings.findFirst({ where: eq(s.bookings.id, bookingId) }),
    db.query.drivers.findFirst({ where: eq(s.drivers.id, driverId) }),
  ]);
  if (!b) return { error: "الحجز غير موجود." };
  if (!d || !d.active || d.status !== "approved") return { error: "السائق غير موجود أو موقوف أو لم يُقبل طلبه بعد." };
  if (b.status === "pending_payment") return { error: "لم يُدفع الحجز بعد. أكّد الدفع أولًا ثم أسند السائق." };
  if (b.status === "cancelled" || b.status === "completed") return { error: "لا يمكن إسناد سائق لحجز ملغي أو منتهٍ." };
  // choosing the same driver again sends both messages again
  const [updated] = await db
    .update(s.bookings)
    .set({ driverId: d.id, driverAssignedAt: new Date(), status: "confirmed", updatedAt: new Date() })
    .where(eq(s.bookings.id, b.id))
    .returning();
  const { toDriver, toCustomer } = await sendDriverAssigned(updated, d);
  revalidatePath(`/admin/bookings/${b.ref}`);
  revalidatePath("/admin/bookings");
  const sent = [toDriver, toCustomer].filter((n) => n?.status === "sent").length;
  return {
    ok: true,
    message:
      sent === 2
        ? `تم إسناد ${d.name} وأُرسلت رسالتا الواتساب للسائق والعميل.`
        : sent === 0 && [toDriver, toCustomer].every((n) => n?.status === "pending")
          ? `تم إسناد ${d.name}. الرسالتان جاهزتان للإرسال بالضغط على «إرسال عبر واتساب» بالأسفل (الإرسال التلقائي غير مربوط بعد).`
          : `تم إسناد ${d.name}، لكن لم تصل كل الرسائل. راجع قسم الرسائل بالأسفل.`,
  };
}

/** Mark a trip completed (staff) and ask the customer for a rating */
export async function completeTrip(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("bookings");
  const r = await finishTrip(String(formData.get("bookingId") ?? ""), null);
  if (r.error || !r.ref) return r;
  redirect(`/admin/bookings/${r.ref}?completed=${r.rating ?? "none"}`);
}

/* ---------- Driver's own trips ---------- */

export async function driverStartTrip(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireDriver();
  const id = String(formData.get("bookingId") ?? "");
  if (!z.uuid().safeParse(id).success) return { error: "رحلة غير صحيحة." };
  const done = await db
    .update(s.bookings)
    .set({ startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(s.bookings.id, id), eq(s.bookings.driverId, me.driverId), eq(s.bookings.status, "confirmed")))
    .returning({ id: s.bookings.id });
  if (!done.length) return { error: "هذه الرحلة ليست لك أو انتهت." };
  revalidatePath("/admin/my-trips");
  return { ok: true, message: "سُجّل بدء الرحلة. رحلة موفقة!" };
}

export async function driverCompleteTrip(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireDriver();
  const r = await finishTrip(String(formData.get("bookingId") ?? ""), me.driverId);
  if (r.error || !r.ref) return r;
  redirect(`/admin/my-trips?done=${r.ref}`);
}

/** completed + rating request. rating: sent (WhatsApp went out) | ready (waiting to be sent by hand) | none */
async function finishTrip(id: string, driverId: number | null): Promise<ActionState & { ref?: string; rating?: "sent" | "ready" | "none" }> {
  if (!z.uuid().safeParse(id).success) return { error: "رحلة غير صحيحة." };
  const where = driverId
    ? and(eq(s.bookings.id, id), eq(s.bookings.driverId, driverId), eq(s.bookings.status, "confirmed"))
    : and(eq(s.bookings.id, id), inArray(s.bookings.status, ["paid", "confirmed"]));
  const done = await db
    .update(s.bookings)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(where)
    .returning();
  if (!done.length) return { error: driverId ? "هذه الرحلة ليست لك أو انتهت." : "لا يمكن إنهاء هذا الحجز." };
  const msg = await requestRating(done[0].id);
  revalidatePath("/admin/my-trips");
  revalidatePath(`/admin/bookings/${done[0].ref}`);
  return { ok: true, ref: done[0].ref, rating: !msg ? "none" : msg.status === "sent" ? "sent" : "ready" };
}
