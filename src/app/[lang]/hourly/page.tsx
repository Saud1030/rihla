import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { getDictionary, type Dictionary, type Locale } from "@/i18n/dictionaries";
import { getCities, getLocations, getSettings, getVatConfig, getVehicles } from "@/lib/catalog";
import { maxBookingDate, todayInRiyadh } from "@/lib/booking";
import { HOUR_PACKAGES, hourlyPrice, isHourPackage } from "@/lib/policy";
import { KIND_LABELS } from "@/lib/regions";
import { isClock, isDay } from "@/lib/timespan";
import { BookingForm, type FormTrip } from "@/components/site/booking-form";
import { createBooking } from "@/app/actions/booking";
import { DirArrow } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLocale();
  return { title: getDictionary(lang).hourly.title };
}

/** Car with a driver for 10, 12 or 24 hours, from any destination. /ar/hourly?from=makkah&hours=12 */
export default async function HourlyPage({ searchParams }: PageProps<"/[lang]/hourly">) {
  const lang = await getLocale();
  const t = getDictionary(lang);
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link href={`/${lang}#search`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <DirArrow className="size-4 rotate-180" />
        {t.hourly.change}
      </Link>
      <Suspense fallback={<div className="mt-6 h-[600px] rounded-xl bg-paper border border-line" />}>
        <HourlyContent lang={lang} t={t} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function HourlyContent({
  lang,
  t,
  searchParams,
}: {
  lang: Locale;
  t: Dictionary;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const from = typeof sp.from === "string" ? sp.from : "";
  const toSlug = typeof sp.to === "string" ? sp.to : "";
  const hours = Number(sp.hours);
  const [locations, cities, vehicles, vat, settings] = await Promise.all([getLocations(), getCities(), getVehicles(), getVatConfig(), getSettings()]);
  const place = locations.find((l) => l.slug === from);
  // where the customer is heading (optional on old links; required by the chooser)
  const dest = toSlug && toSlug !== from ? (locations.find((l) => l.slug === toSlug) ?? null) : null;

  if (!place || !isHourPackage(hours) || settings.hourly_enabled === "0" || !vehicles.length) {
    return (
      <div className="mt-6 bg-paper border border-line rounded-xl p-10 text-center">
        <h1 className="text-2xl font-semibold">{t.hourly.unavailableTitle}</h1>
        <p className="mt-2 text-muted">{t.hourly.unavailableLead}</p>
        <Link href={`/${lang}#search`} className="btn btn-primary mt-5">
          {t.hourly.change}
        </Link>
      </div>
    );
  }

  const city = cities.find((c) => c.slug === place.city);
  const name = lang === "ar" ? place.nameAr : place.nameEn;
  const trips: FormTrip[] = vehicles.map((v) => ({
    id: `h:${v.id}`,
    price: hourlyPrice(v, hours),
    compareAtPrice: null,
    name: lang === "ar" ? v.nameAr : v.nameEn,
    category: v.category,
    categoryLabel: t.fleet.category[v.category],
    passengers: v.passengers,
    bags: v.bags,
    imageUrl: v.imageUrl,
  }));

  return (
    <>
      <header className="mt-4 mb-8">
        <h1 className="text-3xl md:text-4xl font-semibold">
          {t.hourly.heading} · {t.search.hours[hours]}
        </h1>
        <p className="mt-2 text-muted">
          {t.hourly.from}: {name}
          {city ? ` — ${KIND_LABELS[place.kind][lang]} · ${lang === "ar" ? `مدينة ${city.nameAr}` : city.nameEn}` : ""}
        </p>
        {dest && (
          <p className="text-muted">
            {t.hourly.to}: {lang === "ar" ? dest.nameAr : dest.nameEn}
          </p>
        )}
        {/* switch package without going back */}
        <nav className="mt-4 flex flex-wrap gap-2" aria-label={t.search.duration}>
          {HOUR_PACKAGES.map((h) => (
            <Link
              key={h}
              href={`/${lang}/hourly?from=${place.slug}${dest ? `&to=${dest.slug}` : ""}&hours=${h}${isDay(sp.date) ? `&date=${sp.date}` : ""}${isClock(sp.time) ? `&time=${sp.time}` : ""}`}
              aria-current={h === hours ? "page" : undefined}
              className={`rounded-full border px-4 py-1.5 text-sm ${h === hours ? "bg-sign text-white border-sign" : "bg-paper border-line hover:border-sign"}`}
            >
              {t.search.hours[h]}
            </Link>
          ))}
        </nav>
        <p className="mt-4 text-sm bg-sign-soft border border-sign/15 rounded-lg px-4 py-2.5 max-w-[75ch]">{t.hourly.note}</p>
      </header>
      <BookingForm
        lang={lang}
        t={{ route: t.route, form: t.form }}
        trips={trips}
        initialTripId={trips[0].id}
        vat={vat}
        hidden={{ hourlyFrom: place.slug, hourlyTo: dest?.slug ?? "", hours: String(hours) }}
        directions={null}
        initialReversed="0"
        minDate={todayInRiyadh()}
        maxDate={maxBookingDate()}
        initialDate={isDay(sp.date) ? sp.date : ""}
        initialTime={isClock(sp.time) ? sp.time : ""}
        span={{ minutes: hours * 60, kind: "ends" }}
        action={createBooking.bind(null, lang)}
      />
    </>
  );
}
