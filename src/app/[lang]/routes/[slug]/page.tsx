import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getLocale } from "@/i18n/server";
import { getDictionary, type Dictionary, type Locale } from "@/i18n/dictionaries";
import { getRouteBySlug, getVatConfig, routeTitle } from "@/lib/catalog";
import { maxBookingDate, todayInRiyadh } from "@/lib/booking";
import { formatDuration, formatNumber } from "@/lib/format";
import { isClock, isDay } from "@/lib/timespan";
import { BookingForm, type FormTrip } from "@/components/site/booking-form";
import { createBooking } from "@/app/actions/booking";
import { DirArrow } from "@/components/icons";

export async function generateMetadata({ params }: PageProps<"/[lang]/routes/[slug]">): Promise<Metadata> {
  const [lang, { slug }] = await Promise.all([getLocale(), params]);
  const route = await getRouteBySlug(slug);
  return route ? { title: routeTitle(route, lang) } : {};
}

export default async function RoutePage({ params, searchParams }: PageProps<"/[lang]/routes/[slug]">) {
  const lang = await getLocale();
  const t = getDictionary(lang);
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link href={`/${lang}/routes`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <DirArrow className="size-4 rotate-180" />
        {t.routes.title}
      </Link>
      <Suspense fallback={<div className="mt-6 h-[600px] rounded-xl bg-paper border border-line" />}>
        <RouteContent lang={lang} t={t} params={params} searchParams={searchParams} />
      </Suspense>
      {/* Marks the page as request-time so the route title in generateMetadata can stream in */}
      <Suspense>
        <RequestTimeMarker />
      </Suspense>
    </div>
  );
}

async function RequestTimeMarker() {
  await connection();
  return null;
}

async function RouteContent({
  lang,
  t,
  params,
  searchParams,
}: {
  lang: Locale;
  t: Dictionary;
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const [route, vat] = await Promise.all([getRouteBySlug(slug), getVatConfig()]);
  if (!route) notFound();

  const reversed = route.bidirectional && sp.dir === "rev";
  const wantedCategory = typeof sp.vehicle === "string" ? sp.vehicle : undefined;
  const initial = route.trips.find((x) => x.vehicle.category === wantedCategory) ?? route.trips[0];

  const trips: FormTrip[] = route.trips.map((x) => ({
    id: String(x.id),
    price: x.price,
    compareAtPrice: x.compareAtPrice,
    name: lang === "ar" ? x.vehicle.nameAr : x.vehicle.nameEn,
    category: x.vehicle.category,
    categoryLabel: t.fleet.category[x.vehicle.category],
    passengers: x.vehicle.passengers,
    bags: x.vehicle.bags,
    imageUrl: x.vehicle.imageUrl,
  }));

  const directions = route.bidirectional
    ? ([
        { label: routeTitle(route, lang, false), value: "0" },
        { label: routeTitle(route, lang, true), value: "1" },
      ] as const)
    : null;

  return (
    <>
      <header className="mt-4 mb-8">
        <h1 className="text-3xl md:text-4xl font-semibold">{routeTitle(route, lang, reversed)}</h1>
        <p className="mt-2 text-muted flex flex-wrap gap-x-5">
          {route.distanceKm != null && (
            <span className="tabular">
              {formatNumber(route.distanceKm, lang)} {t.routes.km}
            </span>
          )}
          {route.durationMin != null && (
            <span>
              {t.routes.duration}: {formatDuration(route.durationMin, lang)}
            </span>
          )}
          <span>{t.routes.lead}</span>
        </p>
      </header>
      <BookingForm
        lang={lang}
        t={{ route: t.route, form: t.form }}
        trips={trips}
        initialTripId={String(initial.id)}
        vat={vat}
        directions={directions ? [...directions] : null}
        initialReversed={reversed ? "1" : "0"}
        minDate={todayInRiyadh()}
        maxDate={maxBookingDate()}
        initialDate={isDay(sp.date) ? sp.date : ""}
        initialTime={isClock(sp.time) ? sp.time : ""}
        span={route.durationMin ? { minutes: route.durationMin, kind: route.to ? "arrives" : "ends" } : null}
        action={createBooking.bind(null, lang)}
      />
    </>
  );
}
