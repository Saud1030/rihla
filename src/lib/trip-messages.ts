import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Booking, Driver, Rating } from "@/db/schema";
import { publicBaseUrl } from "./public-url";
import { formatDate, formatTime } from "./format";
import { companyName, notify, readSettings } from "./notify";

/** The messages sent around a trip: driver assigned (to both sides), rating request, new rating (to the company email). */

export const bookingLink = async (b: Pick<Booking, "ref" | "locale">) => `${await publicBaseUrl()}/${b.locale === "en" ? "en" : "ar"}/booking/${b.ref}`;
export const carLine = (d: Pick<Driver, "carType" | "carModel" | "carColor">, lang: "ar" | "en" = "ar") =>
  [d.carType, d.carModel, d.carColor].filter(Boolean).join(lang === "ar" ? " · " : " · ");
const when = (b: Booking, lang: "ar" | "en") => `${formatDate(b.pickupDate, lang)} ${lang === "ar" ? "الساعة" : "at"} ${formatTime(b.pickupTime, lang)}`;

/** Driver gets the customer's details, the customer gets the driver's (WhatsApp) */
export async function sendDriverAssigned(b: Booking, d: Driver) {
  const destination = b.dropoffAddress || b.routeTitle;
  const people = `${b.passengers} راكب، ${b.bags} حقيبة`;
  const driverParams = [d.name, b.ref, b.customerName, b.customerPhone, when(b, "ar"), b.pickupAddress, destination, people, [b.flightNumber && `رحلة الطيران ${b.flightNumber}`, b.notes].filter(Boolean).join(" - ") || "-"];
  const driverBody = [
    `مرحبًا ${d.name}، لديك رحلة جديدة رقم ${b.ref}.`,
    `الرحلة: ${b.routeTitle}`,
    `العميل: ${b.customerName}`,
    `جوال العميل (واتساب): ${b.customerPhone}`,
    `الموعد: ${when(b, "ar")}`,
    `الاستلام: ${b.pickupAddress}`,
    `الوجهة: ${destination}`,
    `الركاب والحقائب: ${people}`,
    b.flightNumber ? `رحلة الطيران: ${b.flightNumber}` : "",
    b.notes ? `ملاحظات العميل: ${b.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const ar = b.locale !== "en";
  const link = await bookingLink(b);
  const car = carLine(d, ar ? "ar" : "en");
  const customerParams = [b.customerName, b.ref, d.name, d.phone, car, d.plateNumber, link];
  const customerBody = ar
    ? [
        `مرحبًا ${b.customerName}، تم تحديد السائق لرحلتك رقم ${b.ref}.`,
        `الموعد: ${when(b, "ar")}`,
        `السائق: ${d.name}`,
        `جوال السائق: ${d.phone}`,
        `السيارة: ${car}`,
        `رقم اللوحة: ${d.plateNumber}`,
        `صورة السائق وتفاصيل الرحلة: ${link}`,
      ].join("\n")
    : [
        `Hello ${b.customerName}, your driver for booking ${b.ref} is confirmed.`,
        `Pickup: ${when(b, "en")}`,
        `Driver: ${d.name}`,
        `Driver's mobile: ${d.phone}`,
        `Car: ${car}`,
        `Plate: ${d.plateNumber}`,
        `Driver photo and trip details: ${link}`,
      ].join("\n");

  const [toDriver, toCustomer] = await Promise.all([
    notify({ bookingId: b.id, channel: "whatsapp", kind: "driver_trip", recipient: d.phone, recipientName: d.name, body: driverBody, params: driverParams }),
    notify({ bookingId: b.id, channel: "whatsapp", kind: "customer_driver", recipient: b.customerPhone, recipientName: b.customerName, body: customerBody, params: customerParams }),
  ]);
  return { toDriver, toCustomer };
}

export const ratingHash = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Sends the customer a WhatsApp message with a private rating link (once per booking).
 * The link's secret is stored only as a hash.
 */
export async function requestRating(bookingId: string) {
  const st = await readSettings();
  if (st.rating_enabled === "0") return null;
  const token = randomBytes(24).toString("hex");
  const [b] = await db
    .update(s.bookings)
    .set({ ratingTokenHash: ratingHash(token), ratingRequestedAt: new Date() })
    .where(and(eq(s.bookings.id, bookingId), eq(s.bookings.status, "completed"), isNull(s.bookings.ratingRequestedAt)))
    .returning();
  if (!b) return null; // not completed, or already asked
  const driver = b.driverId ? await db.query.drivers.findFirst({ where: eq(s.drivers.id, b.driverId) }) : null;
  const ar = b.locale !== "en";
  const link = `${await publicBaseUrl()}/${ar ? "ar" : "en"}/rate/${token}`;
  const driverName = driver?.name ?? (ar ? "السائق" : "your driver");
  const body = ar
    ? `شكرًا ${b.customerName} لاختيارك ${companyName(st, "ar")}.\nنسعد بتقييمك للسائق ${driverName} ولخدمتنا في رحلتك رقم ${b.ref}، يستغرق أقل من دقيقة:\n${link}`
    : `Thank you ${b.customerName} for riding with ${companyName(st, "en")}.\nPlease rate ${driverName} and our service for booking ${b.ref}. It takes less than a minute:\n${link}`;
  return notify({ bookingId: b.id, channel: "whatsapp", kind: "rating_request", recipient: b.customerPhone, recipientName: b.customerName, body, params: [b.customerName, driverName, link] });
}

/** The new rating goes to the company email (settings: rating email, or the contact email) */
export async function emailRating(r: Rating, b: Booking, driverName: string | null) {
  const st = await readSettings();
  const to = (st.notify_email || st.email || "").trim();
  if (!to) return null;
  const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);
  const base = await publicBaseUrl();
  const body = [
    `تقييم جديد للحجز ${b.ref}`,
    "",
    `تقييم الشركة: ${stars(r.companyStars)} (${r.companyStars} من 5)`,
    `تقييم السائق${driverName ? ` ${driverName}` : ""}: ${stars(r.driverStars)} (${r.driverStars} من 5)`,
    `تعليق العميل: ${r.comment || "لا يوجد"}`,
    "",
    `العميل: ${b.customerName} - ${b.customerPhone}`,
    `الرحلة: ${b.routeTitle}`,
    `الموعد: ${when(b, "ar")}`,
    "",
    `تفاصيل الحجز في لوحة التحكم: ${base}/admin/bookings/${b.ref}`,
  ].join("\n");
  return notify({
    bookingId: b.id,
    channel: "email",
    kind: "rating_received",
    recipient: to,
    recipientName: companyName(st, "ar"),
    subject: `تقييم جديد ${r.companyStars}/5 - حجز ${b.ref}`,
    body,
  });
}
