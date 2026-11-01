"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { isLocale, type Locale } from "@/i18n/dictionaries";
import { pairTitle, routeTitle } from "@/lib/catalog";
import { maxBookingDate, newBookingRef, todayInRiyadh } from "@/lib/booking";
import { earliestPickup, farEnough, parseLeadHours } from "@/lib/lead-time";
import { distancePrice, driveMinutes, parseVatConfig, roadKm, withVat } from "@/lib/pricing";
import { hourlyPrice, isHourPackage } from "@/lib/policy";
import { phoneWithCountry } from "@/lib/phone";
import { DEFAULT_COUNTRY, dialCode } from "@/lib/countries";
import { multiTitle, parseLegs, quoteMultiTrip } from "@/lib/multi";
import { cityHourlyPrices } from "@/lib/hourly";

export type BookingFormState = {
  errors?: Partial<Record<FieldName, true>>;
  formError?: "generic" | "trip" | "stops";
  /** the pickup is sooner than the admin allows: book at least this many hours ahead */
  tooSoon?: number;
  values?: Record<string, string>;
};

const fields = [
  "tripId",
  "reversed",
  "name",
  "phone",
  "email",
  "date",
  "time",
  "passengers",
  "bags",
  "pickup",
  "dropoff",
  "flight",
  "notes",
] as const;
type FieldName = (typeof fields)[number];

const schema = z.object({
  // "12" = fixed route trip id, "d:5" = distance-priced trip with vehicle 5, "h:5" = hourly with vehicle 5,
  // "m:5" = multi-destination trip with vehicle 5
  tripId: z.string().regex(/^(\d{1,9}|[dhm]:\d{1,9})$/),
  reversed: z.enum(["0", "1"]).default("0"),
  name: z.string().trim().min(3).max(100),
  // WhatsApp number (required): driver details are sent to it. Stored as +<country><number>
  // typed next to the country-code list (phoneCountry); combined before checking
  phone: z.string().min(9),
  email: z.union([z.literal(""), z.email().max(200)]),
  date: z.iso.date(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  passengers: z.coerce.number().int().min(1).max(100),
  bags: z.coerce.number().int().min(0).max(200),
  pickup: z.string().trim().min(3).max(300),
  dropoff: z.string().trim().max(300).default(""),
  flight: z.string().trim().max(20).default(""),
  notes: z.string().trim().max(1000).default(""),
});

export async function createBooking(lang: string, _prev: BookingFormState, formData: FormData): Promise<BookingFormState> {
  const locale = isLocale(lang) ? lang : "ar";
  const values = Object.fromEntries(fields.map((f) => [f, String(formData.get(f) ?? "")]));
  const fromSlug = String(formData.get("fromLoc") ?? "").slice(0, 80);
  const toSlug = String(formData.get("toLoc") ?? "").slice(0, 80);
  const hourlyFrom = String(formData.get("hourlyFrom") ?? "").slice(0, 80);
  const hourlyTo = String(formData.get("hourlyTo") ?? "").slice(0, 80);
  const hours = Number(formData.get("hours") ?? 0);
  const hourlyCity = String(formData.get("hourlyCity") ?? "").slice(0, 80);
  const legSlugs = parseLegs(String(formData.get("legs") ?? ""));

  // the WhatsApp number: country chosen from the list + the number typed
  const country = String(formData.get("phoneCountry") ?? "");
  values.phoneCountry = dialCode(country) ? country : DEFAULT_COUNTRY;
  const phone = phoneWithCountry(dialCode(values.phoneCountry), values.phone) ?? "";
  const parsed = schema.safeParse({ ...values, phone });
  if (!parsed.success) {
    const errors: BookingFormState["errors"] = {};
    for (const issue of parsed.error.issues) errors[issue.path[0] as FieldName] = true;
    return { errors, values };
  }
  const d = parsed.data;

  // Price, capacity and VAT always come from the database, never from the form
  const resolved = d.tripId.startsWith("d:")
    ? await resolveDistanceTrip(Number(d.tripId.slice(2)), fromSlug, toSlug, locale)
    : d.tripId.startsWith("h:")
      ? hourlyCity
        ? await resolveCityHourlyTrip(Number(d.tripId.slice(2)), hourlyCity, hours, locale)
        : await resolveHourlyTrip(Number(d.tripId.slice(2)), hourlyFrom, hourlyTo, hours, locale)
      : d.tripId.startsWith("m:")
        ? await resolveMultiTrip(Number(d.tripId.slice(2)), legSlugs, locale)
        : await resolveFixedTrip(Number(d.tripId), d.reversed === "1", locale);
  if (!resolved) return { formError: "trip", values };

  // multi-trip: each trip after the first has its own date and time, in order, after the first one
  let legs: { from: string; to: string; at: string }[] | null = null;
  if (resolved.mode === "multi" && resolved.legNames) {
    legs = [];
    let last = "";
    for (const [n, leg] of resolved.legNames.entries()) {
      let at = `${d.date} ${d.time}`;
      if (n > 0) {
        const sd = String(formData.get(`stopDate_${n + 1}`) ?? "");
        const stt = String(formData.get(`stopTime_${n + 1}`) ?? "");
        values[`stopDate_${n + 1}`] = sd;
        values[`stopTime_${n + 1}`] = stt;
        at = `${sd} ${stt}`;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(sd) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(stt) || sd > maxBookingDate() || at <= last) return { formError: "stops", values };
      }
      legs.push({ ...leg, at });
      last = at;
    }
  }

  const errors: BookingFormState["errors"] = {};
  if (d.date < todayInRiyadh() || d.date > maxBookingDate()) errors.date = true;
  // booked far enough ahead (a few minutes' grace for the time spent filling the form)
  const leadHours = parseLeadHours((await db.query.settings.findFirst({ where: eq(s.settings.key, "min_lead_hours") }))?.value);
  if (!errors.date && !farEnough(d.date, d.time, earliestPickup(leadHours, Date.now() - 10 * 60_000))) {
    errors.time = true;
    return { errors, tooSoon: leadHours, values };
  }
  if (d.passengers > resolved.vehicle.passengers) errors.passengers = true;
  if (d.bags > resolved.vehicle.bags) errors.bags = true;
  if (Object.keys(errors).length) return { errors, values };

  const settingRows = await db.select().from(s.settings).where(inArray(s.settings.key, ["vat_rate", "prices_include_vat", "vat_number"]));
  const vat = parseVatConfig(Object.fromEntries(settingRows.map((r) => [r.key, r.value])));
  const money = withVat(resolved.price, vat.rateBp);

  // Retry on the (very unlikely) ref collision
  let ref = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    ref = newBookingRef();
    try {
      await db.insert(s.bookings).values({
        ref,
        tripId: resolved.tripId,
        pricingMode: resolved.mode,
        fromLocationId: resolved.fromId,
        toLocationId: resolved.toId,
        vehicleId: resolved.vehicle.id,
        distanceKm: resolved.km,
        hours: resolved.hours,
        legs,
        hourlyCity: resolved.hourlyCity ?? null,
        durationMin: resolved.durationMin,
        routeTitle: resolved.title,
        vehicleName: locale === "ar" ? resolved.vehicle.nameAr : resolved.vehicle.nameEn,
        reversed: resolved.reversed,
        customerName: d.name,
        customerPhone: d.phone,
        customerEmail: d.email || null,
        passengers: d.passengers,
        bags: d.bags,
        pickupDate: d.date,
        pickupTime: d.time,
        pickupAddress: d.pickup,
        dropoffAddress: d.dropoff || null,
        flightNumber: d.flight || null,
        notes: d.notes || null,
        subtotal: money.subtotal,
        vatRate: vat.rateBp,
        vatAmount: money.vat,
        amount: money.total,
        currency: "SAR",
        locale,
      });
      break;
    } catch (e) {
      const code = (e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
      if (code === "23505" && attempt < 4) continue; // unique violation on ref
      console.error("createBooking failed", e);
      return { formError: "generic", values };
    }
  }

  redirect(`/${locale}/checkout/${ref}`);
}

type Resolved = {
  mode: "fixed" | "distance" | "hourly" | "multi";
  legNames?: { from: string; to: string }[];
  hourlyCity?: string;
  hours?: number | null;
  tripId: number | null;
  vehicle: typeof s.vehicles.$inferSelect;
  price: number;
  title: string;
  reversed: boolean;
  fromId: number | null;
  toId: number | null;
  km: number | null;
  /** minutes the booking lasts, for the end / arrival time */
  durationMin: number | null;
};

async function resolveFixedTrip(id: number, wantReversed: boolean, locale: Locale): Promise<Resolved | null> {
  const trip = await db.query.trips.findFirst({
    where: eq(s.trips.id, id),
    with: { vehicle: true, route: { with: { from: true, to: true } } },
  });
  if (!trip || !trip.active || !trip.vehicle.active || !trip.route.active) return null;
  if (!trip.route.from.active || (trip.route.to && !trip.route.to.active)) return null;
  const reversed = wantReversed && trip.route.bidirectional;
  const [from, to] = reversed ? [trip.route.to, trip.route.from] : [trip.route.from, trip.route.to];
  return {
    mode: "fixed",
    tripId: trip.id,
    vehicle: trip.vehicle,
    price: trip.price,
    title: routeTitle(trip.route, locale, reversed),
    reversed,
    fromId: from?.id ?? null,
    toId: to?.id ?? null,
    km: trip.route.distanceKm,
    durationMin: trip.route.durationMin,
  };
}

async function resolveDistanceTrip(vehicleId: number, fromSlug: string, toSlug: string, locale: Locale): Promise<Resolved | null> {
  if (!fromSlug || !toSlug || fromSlug === toSlug) return null;
  const [setting] = await db.select().from(s.settings).where(eq(s.settings.key, "distance_pricing")).limit(1);
  if (setting?.value === "0") return null;
  const [vehicle] = await db.select().from(s.vehicles).where(and(eq(s.vehicles.id, vehicleId), eq(s.vehicles.active, true))).limit(1);
  const locs = await db.select().from(s.locations).where(and(inArray(s.locations.slug, [fromSlug, toSlug]), eq(s.locations.active, true)));
  const from = locs.find((l) => l.slug === fromSlug);
  const to = locs.find((l) => l.slug === toSlug);
  if (!vehicle || !from || !to) return null;
  const km = roadKm(from, to);
  if (km == null) return null;
  return {
    mode: "distance",
    tripId: null,
    vehicle,
    price: distancePrice(vehicle, km),
    title: pairTitle(from, to, locale),
    reversed: false,
    fromId: from.id,
    toId: to.id,
    km,
    durationMin: driveMinutes(km),
  };
}

async function resolveHourlyTrip(vehicleId: number, placeSlug: string, toSlug: string, hours: number, locale: Locale): Promise<Resolved | null> {
  if (!placeSlug || !isHourPackage(hours)) return null;
  const [setting] = await db.select().from(s.settings).where(eq(s.settings.key, "hourly_enabled")).limit(1);
  if (setting?.value === "0") return null;
  const [vehicle] = await db.select().from(s.vehicles).where(and(eq(s.vehicles.id, vehicleId), eq(s.vehicles.active, true))).limit(1);
  const [place] = await db.select().from(s.locations).where(and(eq(s.locations.slug, placeSlug), eq(s.locations.active, true))).limit(1);
  if (!vehicle || !place) return null;
  // destination is optional for old links, but if one is sent it must be a real, different, active place
  let dest: typeof place | null = null;
  if (toSlug) {
    if (toSlug === placeSlug) return null;
    [dest] = await db.select().from(s.locations).where(and(eq(s.locations.slug, toSlug), eq(s.locations.active, true))).limit(1);
    if (!dest) return null;
  }
  const name = locale === "ar" ? place.nameAr : place.nameEn;
  const destName = dest ? (locale === "ar" ? dest.nameAr : dest.nameEn) : "";
  const title =
    locale === "ar"
      ? `سيارة مع سائق ${hours === 10 ? "١٠ ساعات" : hours === 12 ? "١٢ ساعة" : "٢٤ ساعة"} – من ${name}${dest ? ` إلى ${destName}` : ""}`
      : `Car with driver, ${hours} hours – from ${name}${dest ? ` to ${destName}` : ""}`;
  return {
    mode: "hourly",
    hours,
    tripId: null,
    vehicle,
    price: hourlyPrice(vehicle, hours),
    title,
    reversed: false,
    fromId: place.id,
    toId: dest?.id ?? null,
    km: null,
    durationMin: hours * 60,
  };
}

async function resolveMultiTrip(vehicleId: number, legSlugs: [string, string][] | null, locale: Locale): Promise<Resolved | null> {
  if (!legSlugs) return null;
  const q = await quoteMultiTrip(legSlugs);
  const opt = q?.options.find((o) => o.vehicle.id === vehicleId);
  if (!q || !opt) return null;
  const name = (p: { nameAr: string; nameEn: string }) => (locale === "ar" ? p.nameAr : p.nameEn);
  return {
    mode: "multi",
    legNames: q.legs.map((l) => ({ from: name(l.from), to: name(l.to) })),
    tripId: null,
    vehicle: opt.vehicle,
    price: opt.price,
    title: multiTitle(q.legs, locale),
    reversed: false,
    fromId: q.legs[0].from.id,
    toId: q.legs[0].to.id,
    km: q.km || null,
    durationMin: q.legs[0].minutes,
  };
}

/** a car with a driver for N hours in a city */
async function resolveCityHourlyTrip(vehicleId: number, citySlug: string, hours: number, locale: Locale): Promise<Resolved | null> {
  if (!isHourPackage(hours)) return null;
  const [setting] = await db.select().from(s.settings).where(eq(s.settings.key, "hourly_enabled")).limit(1);
  if (setting?.value === "0") return null;
  const [vehicle] = await db.select().from(s.vehicles).where(and(eq(s.vehicles.id, vehicleId), eq(s.vehicles.active, true))).limit(1);
  const [city] = await db.select().from(s.cities).where(and(eq(s.cities.slug, citySlug), eq(s.cities.active, true))).limit(1);
  if (!vehicle || !city) return null;
  // a place in the city, so the booking shows up when filtering by city or destination
  const [place] = await db.select({ id: s.locations.id }).from(s.locations).where(and(eq(s.locations.city, city.slug), eq(s.locations.active, true))).orderBy(s.locations.sortOrder).limit(1);
  const price = (await cityHourlyPrices(city.slug, hours, [vehicle])).get(vehicle.id)!;
  const title =
    locale === "ar"
      ? `سيارة مع سائق ${hours === 10 ? "١٠ ساعات" : hours === 12 ? "١٢ ساعة" : "٢٤ ساعة"} – مدينة ${city.nameAr}`
      : `Car with driver, ${hours} hours – ${city.nameEn}`;
  return { mode: "hourly", hours, hourlyCity: city.slug, tripId: null, vehicle, price, title, reversed: false, fromId: place?.id ?? null, toId: null, km: null, durationMin: hours * 60 };
}
