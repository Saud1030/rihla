import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getLocale } from "@/i18n/server";
import { getDictionary, type Dictionary, type Locale } from "@/i18n/dictionaries";
import { findRoute, getCatalog, getCities, getVatConfig, pairTitle, quoteDistanceTrip } from "@/lib/catalog";
import { maxBookingDate, todayInRiyadh } from "@/lib/booking";
import { formatDuration, formatNumber } from "@/lib/format";
import { KIND_LABELS, regionName } from "@/lib/regions";
import { isClock, isDay } from "@/lib/timespan";
import { BookingForm, type FormTrip } from "@/components/site/booking-form";
import { createBooking } from "@/app/actions/booking";
import { DirArrow } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLocale();
  return { title: getDictionary(lang).trip.title };
}

/** A trip between any two destinations, priced by distance. /ar/trip?from=riyadh-airport&to=diriyah */
export default async function TripPage({ searchParams }: PageProps<"/[lang]/trip">) {
  const lang = await getLocale();
  const t = getDictionary(lang);
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link href={`/${lang}/routes`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <DirArrow className="size-4 rotate-180" />
        {t.routes.title}
      </Link>
      <Suspense fallback={<div className="mt-6 h-[600px] rounded-xl bg-paper border border-line" />}>
        <TripContent lang={lang} t={t} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function TripContent({
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
  const to = typeof sp.to === "string" ? sp.to : "";

  // A fixed-price route always wins over a distance quote
  const fixed = findRoute(await getCatalog(), from, to);
  if (fixed) {
    const q = new URLSearchParams();
    if (fixed.reversed) q.set("dir", "rev");
    if (isDay(sp.date)) q.set("date", sp.date);
    if (isClock(sp.time)) q.set("time", sp.time);
    redirect(`/${lang}/routes/${fixed.route.slug}${q.size ? `?${q}` : ""}`);
  }

  const [quote, vat, cities] = await Promise.all([quoteDistanceTrip(from, to), getVatConfig(), getCities()]);
  if (!quote || !quote.options.length) {
    return (
      <div className="mt-6 bg-paper border border-line rounded-xl p-10 text-center">
        <h1 className="text-2xl font-semibold">{t.trip.unavailableTitle}</h1>
        <p className="mt-2 text-muted">{t.trip.unavailableLead}</p>
        <Link href={`/${lang}/routes`} className="btn btn-primary mt-5">
          {t.routes.title}
        </Link>
      </div>
    );
  }

  const city = (slug: string) => cities.find((c) => c.slug === slug);
  const place = (l: typeof quote.from) => {
    const c = city(l.city);
    return `${KIND_LABELS[l.kind][lang]} · ${c ? (lang === "ar" ? c.nameAr : c.nameEn) : ""}${c ? `، ${regionName(c.region, lang)}` : ""}`;
  };

  const trips: FormTrip[] = quote.options.map(({ vehicle, price }) => ({
    id: `d:${vehicle.id}`,
    price,
    compareAtPrice: null,
    name: lang === "ar" ? vehicle.nameAr : vehicle.nameEn,
    category: vehicle.category,
    categoryLabel: t.fleet.category[vehicle.category],
    passengers: vehicle.passengers,
    bags: vehicle.bags,
    imageUrl: vehicle.imageUrl,
  }));

  return (
    <>
      <header className="mt-4 mb-8">
        <h1 className="text-3xl md:text-4xl font-semibold">{pairTitle(quote.from, quote.to, lang)}</h1>
        <p className="mt-2 text-sm text-muted">
          {t.trip.from}: {place(quote.from)} — {t.trip.to}: {place(quote.to)}
        </p>
        <p className="mt-2 text-muted flex flex-wrap gap-x-5">
          <span className="tabular">
            {t.trip.about} {formatNumber(quote.km, lang)} {t.routes.km}
          </span>
          <span>
            {t.routes.duration}: {t.trip.about} {formatDuration(quote.minutes, lang)}
          </span>
          <span>{t.routes.lead}</span>
        </p>
        <p className="mt-3 text-sm bg-sign-soft border border-sign/15 rounded-lg px-4 py-2.5 max-w-[70ch]">{t.trip.estimateNote}</p>
      </header>
      <BookingForm
        lang={lang}
        t={{ route: t.route, form: t.form }}
        trips={trips}
        initialTripId={trips[0].id}
        vat={vat}
        hidden={{ fromLoc: quote.from.slug, toLoc: quote.to.slug }}
        directions={null}
        initialReversed="0"
        minDate={todayInRiyadh()}
        maxDate={maxBookingDate()}
        initialDate={isDay(sp.date) ? sp.date : ""}
        initialTime={isClock(sp.time) ? sp.time : ""}
        span={{ minutes: quote.minutes, kind: "arrives" }}
        action={createBooking.bind(null, lang)}
      />
    </>
  );
}
