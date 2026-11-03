"use server";

import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { invalidateCatalogCache } from "@/lib/catalog";
import { MAX_INSTALLMENTS, markInstallmentPaid, sendInstallmentLink } from "@/lib/packages";
import { sarToHalalas } from "@/lib/money-input";
import type { ActionState } from "./actions";

const digits = (v: FormDataEntryValue | null) => String(v ?? "").replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).trim();

function readPackage(formData: FormData) {
  const nameAr = String(formData.get("nameAr") ?? "").trim().slice(0, 100);
  const nameEn = String(formData.get("nameEn") ?? "").trim().slice(0, 100);
  const detailsAr = String(formData.get("detailsAr") ?? "").trim().slice(0, 2000);
  const detailsEn = String(formData.get("detailsEn") ?? "").trim().slice(0, 2000);
  const price = sarToHalalas(formData.get("price"));
  const installments = Number(digits(formData.get("installments")));
  const passengers = Number(digits(formData.get("passengers")));
  const vehicleId = Number(formData.get("vehicleId") ?? 0) || null;
  const sortOrder = Number(digits(formData.get("sortOrder"))) || 0;
  const afterTrip = Number(digits(formData.get("afterTrip")) || "0");
  if (nameAr.length < 2) return { error: "اكتب اسم الباقة." } as const;
  if (price == null || price <= 0) return { error: "السعر: اكتب المبلغ بالريال قبل الضريبة، مثل 1500" } as const;
  if (!Number.isInteger(installments) || installments < 1 || installments > MAX_INSTALLMENTS) return { error: `عدد الدفعات من ١ إلى ${MAX_INSTALLMENTS.toLocaleString("ar-SA")}.` } as const;
  if (!Number.isInteger(afterTrip) || afterTrip < 0 || (installments > 0 && afterTrip >= installments))
    return { error: "الدفعات بعد الرحلة أقل من عدد الدفعات (الدفعة الأولى دائمًا وقت الحجز)." } as const;
  if (!Number.isInteger(passengers) || passengers < 1 || passengers > 100) return { error: "عدد الركاب من ١ إلى ١٠٠." } as const;
  return { values: { nameAr, nameEn, detailsAr, detailsEn, price, installments, afterTrip, passengers, vehicleId, sortOrder } } as const;
}

function done() {
  invalidateCatalogCache();
  revalidatePath("/admin/packages");
}

export async function addPackage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("catalog");
  const r = readPackage(formData);
  if ("error" in r) return { error: r.error };
  await db.insert(s.packages).values(r.values);
  done();
  return { ok: true, message: `تمت إضافة الباقة «${r.values.nameAr}».` };
}

export async function savePackage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("catalog");
  const r = readPackage(formData);
  if ("error" in r) return { error: r.error };
  const rows = await db.update(s.packages).set(r.values).where(eq(s.packages.id, Number(formData.get("id") ?? 0))).returning({ id: s.packages.id });
  if (!rows.length) return { error: "الباقة غير موجودة." };
  done();
  return { ok: true, message: "تم حفظ الباقة." };
}

export async function togglePackage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("catalog");
  const on = formData.get("on") === "1";
  await db.update(s.packages).set({ active: on }).where(eq(s.packages.id, Number(formData.get("id") ?? 0)));
  done();
  return { ok: true, message: on ? "الباقة ظاهرة للعملاء." : "تم إخفاء الباقة." };
}

export async function deletePackage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("catalog");
  await db.delete(s.packages).where(eq(s.packages.id, Number(formData.get("id") ?? 0)));
  done();
  return { ok: true, message: "تم حذف الباقة. الحجوزات السابقة تبقى كما هي." };
}

/* ---------- installments of a package booking (Admin -> booking page) ---------- */

/** Send the customer the payment link of one installment on WhatsApp */
export async function sendInstallment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("bookings");
  const inst = await db.query.installments.findFirst({ where: eq(s.installments.id, Number(formData.get("id") ?? 0)) });
  if (!inst) return { error: "الدفعة غير موجودة." };
  if (inst.paidAt) return { error: "هذه الدفعة مدفوعة." };
  const b = await db.query.bookings.findFirst({ where: eq(s.bookings.id, inst.bookingId) });
  if (!b || b.status === "cancelled") return { error: "الحجز ملغي." };
  const count = (await db.select({ id: s.installments.id }).from(s.installments).where(eq(s.installments.bookingId, b.id)).orderBy(asc(s.installments.seq))).length;
  const sent = await sendInstallmentLink(inst, b, count);
  revalidatePath(`/admin/bookings/${b.ref}`);
  return sent?.status === "failed" ? { error: "تعذّر الإرسال على الواتساب. انسخ الرابط وأرسله بنفسك." } : { ok: true, message: `تم إرسال رابط الدفعة ${inst.seq.toLocaleString("ar-SA")} للعميل على الواتساب.` };
}

/** The customer paid an installment another way (cash, transfer): mark it paid by hand */
export async function markInstallment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireSection("bookings");
  const id = Number(formData.get("id") ?? 0);
  const method = formData.get("method") === "cash" ? "cash" : "transfer";
  const inst = await db.query.installments.findFirst({ where: eq(s.installments.id, id) });
  if (!inst) return { error: "الدفعة غير موجودة." };
  const row = await markInstallmentPaid(id, { paymentId: `MAN-${inst.token.slice(0, 12)}`, method });
  if (!row) return { error: "هذه الدفعة مدفوعة من قبل." };
  const b = await db.query.bookings.findFirst({ where: eq(s.bookings.id, inst.bookingId) });
  revalidatePath(`/admin/bookings/${b?.ref ?? ""}`);
  console.info("installment marked paid", { by: admin.email, id });
  return { ok: true, message: "تم تسجيل الدفعة كمدفوعة." };
}
