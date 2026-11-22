"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { isLocale } from "@/i18n/dictionaries";
import { maxBookingDate, newBookingRef, todayInRiyadh } from "@/lib/booking";
import { earliestPickup, farEnough, parseLeadHours } from "@/lib/lead-time";
import { parseVatConfig, withVat } from "@/lib/pricing";
import { phoneWithCountry } from "@/lib/phone";
import { DEFAULT_COUNTRY, dialCode } from "@/lib/countries";
import { createInstallments } from "@/lib/packages";

export type PackageFormState = {
  errors?: Partial<Record<"date" | "time" | "name" | "phone" | "email" | "passengers" | "pickup", true>>;
  tooSoon?: number;
  formError?: "package" | "generic";
  values?: Record<string, string>;
};

const FIELDS = ["date", "time", "name", "phone", "phoneCountry", "email", "passengers", "pickup", "notes"] as const;

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  name: z.string().trim().min(3).max(100),
  phone: z.string().min(9),
  email: z.union([z.literal(""), z.email().max(200)]),
  passengers: z.coerce.number().int().min(1).max(100),
  pickup: z.string().trim().min(2).max(300),
  notes: z.string().trim().max(1000).default(""),
});

/** Book a package: the price comes from the database; the first installment is paid right after */
export async function createPackageBooking(lang: string, packageId: number, _prev: PackageFormState, formData: FormData): Promise<PackageFormState> {
  const locale = isLocale(lang) ? lang : "ar";
  const values = Object.fromEntries(FIELDS.map((f) => [f, String(formData.get(f) ?? "")]));
  values.phoneCountry = dialCode(values.phoneCountry) ? values.phoneCountry : DEFAULT_COUNTRY;
  const phone = phoneWithCountry(dialCode(values.phoneCountry), values.phone) ?? "";
  const parsed = schema.safeParse({ ...values, phone, email: values.email.trim().toLowerCase() });
  if (!parsed.success) {
    const errors: PackageFormState["errors"] = {};
    for (const issue of parsed.error.issues) errors[issue.path[0] as keyof NonNullable<PackageFormState["errors"]>] = true;
    return { errors, values };
  }
  const d = parsed.data;
  const pkg = await db.query.packages.findFirst({ where: and(eq(s.packages.id, packageId), eq(s.packages.active, true)) });
  if (!pkg) return { formError: "package", values };
  if (d.date < todayInRiyadh() || d.date > maxBookingDate()) return { errors: { date: true }, values };
  const lead = parseLeadHours((await db.query.settings.findFirst({ where: eq(s.settings.key, "min_lead_hours") }))?.value);
  if (!farEnough(d.date, d.time, earliestPickup(lead, Date.now() - 10 * 60_000))) return { errors: { time: true }, tooSoon: lead, values };
  if (d.passengers > pkg.passengers) return { errors: { passengers: true }, values };

  const vehicle = pkg.vehicleId ? await db.query.vehicles.findFirst({ where: eq(s.vehicles.id, pkg.vehicleId) }) : null;
  const settingRows = await db.select().from(s.settings).where(inArray(s.settings.key, ["vat_rate", "prices_include_vat", "vat_number"]));
  const vat = parseVatConfig(Object.fromEntries(settingRows.map((r) => [r.key, r.value])));
  const money = withVat(pkg.price, vat.rateBp);
  const title = locale === "ar" ? pkg.nameAr : pkg.nameEn || pkg.nameAr;

  let ref = "";
  let bookingId = "";
  for (let attempt = 0; attempt < 5 && !bookingId; attempt++) {
    ref = newBookingRef();
    try {
      const [row] = await db
        .insert(s.bookings)
        .values({
          ref,
          pricingMode: "package",
          packageId: pkg.id,
          vehicleId: vehicle?.id ?? null,
          routeTitle: title,
          vehicleName: vehicle ? (locale === "ar" ? vehicle.nameAr : vehicle.nameEn) : title,
          customerName: d.name,
          customerPhone: d.phone,
          customerEmail: d.email || null,
          passengers: d.passengers,
          bags: 0,
          pickupDate: d.date,
          pickupTime: d.time,
          pickupAddress: d.pickup,
          notes: d.notes || null,
          subtotal: money.subtotal,
          vatRate: vat.rateBp,
          vatAmount: money.vat,
          amount: money.total,
          currency: "SAR",
          locale,
        })
        .returning({ id: s.bookings.id });
      bookingId = row.id;
    } catch (e) {
      const code = (e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
      if (code === "23505" && attempt < 4) continue;
      console.error("package booking failed", e);
      return { formError: "generic", values };
    }
  }
  const [first] = await createInstallments(bookingId, money.total, pkg.installments, pkg.afterTrip);
  redirect(`/${locale}/pay/${first.token}`);
}
