import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { getDictionary, type Dictionary, type Locale } from "@/i18n/dictionaries";
import { getVatConfig } from "@/lib/catalog";
import { maxBookingDate, todayInRiyadh } from "@/lib/booking";
import { formatDuration, formatNumber, formatSAR } from "@/lib/format";
import { multiTitle, parseStops, quoteMultiTrip } from "@/lib/multi";
import { displayPrice } from "@/lib/pricing";
import { isClock, isDay } from "@/lib/timespan";
import { BookingForm, type FormTrip } from "@/components/site/booking-form";
import { createBooking } from "@/app/actions/booking";
import { DirArrow } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLocale();
  return { title: getDictionary(lang).multi.title };
}

/** One car through several stops, in order. /ar/multi?stops=jeddah-airport,makkah,madinah */
export default async function MultiPage({ searchParams }: PageProps<"/[lang]/multi">) {
  const lang = await getLocale();
  const t = getDictionary(lang);
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link href={`/${lang}#search`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <DirArrow className="size-4 rotate-180" />
        {t.nav.home}
      </Link>
      <Suspense fallback={<div className="mt-6 h-[600px] rounded-xl bg-paper border border-line" />}>
        <Content lang={lang} t={t} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Content({ lang, t, searchParams }: { lang: Locale; t: Dictionary; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const stops = parseStops(sp.stops);
  const [quote, vat] = await Promise.all([stops ? quoteMultiTrip(stops) : null, getVatConfig()]);
  if (!quote || !quote.options.length) {
    return (
      <div className="mt-6 bg-paper border border-line rounded-xl p-10 text-center">
        <h1 className="text-2xl font-semibold">{t.multi.unavailableTitle}</h1>
        <p className="mt-2 text-muted">{t.multi.unavailableLead}</p>
        <Link href={`/${lang}#search`} className="btn btn-primary mt-5">
          {t.hero.showPrices}
        </Link>
      </div>
    );
  }

  const trips: FormTrip[] = quote.options.map(({ vehicle, price }) => ({
    id: `m:${vehicle.id}`,
    price,
    compareAtPrice: null,
    name: lang === "ar" ? vehicle.nameAr : vehicle.nameEn,
    category: vehicle.category,
    categoryLabel: t.fleet.category[vehicle.category],
    passengers: vehicle.passengers,
    bags: vehicle.bags,
    imageUrl: vehicle.imageUrl,
  }));
  const first = quote.options[0];
  const name = (p: { nameAr: string; nameEn: string }) => (lang === "ar" ? p.nameAr : p.nameEn);

  return (
    <>
      <header className="mt-4 mb-6">
        <p className="text-sm text-sign font-medium">{t.multi.title}</p>
        <h1 className="text-3xl md:text-4xl font-semibold text-balance">{multiTitle(quote.places, lang)}</h1>
        <p className="mt-2 text-muted flex flex-wrap gap-x-5">
          {quote.km > 0 && (
            <span className="tabular">
              {t.multi.total}: {t.trip.about} {formatNumber(quote.km, lang)} {t.routes.km}
            </span>
          )}
          {quote.minutes > 0 && (
            <span>
              {t.routes.duration}: {t.trip.about} {formatDuration(quote.minutes, lang)}
            </span>
          )}
        </p>
        <p className="mt-3 text-sm bg-sign-soft border border-sign/15 rounded-lg px-4 py-2.5 max-w-[70ch]">{t.multi.lead}</p>
      </header>

      <section className="mb-8" aria-labelledby="legs-title">
        <h2 id="legs-title" className="font-semibold mb-3">
          {t.multi.legs}
        </h2>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="multi-legs">
          {quote.legs.map((l, i) => (
            <li key={i} className="rounded-lg border border-line bg-paper px-4 py-3 text-sm">
              <span className="block text-xs text-muted">
                {t.multi.leg} {formatNumber(i + 1, lang)}
              </span>
              <span className="block font-medium">
                {name(l.from)} {lang === "ar" ? "←" : "→"} {name(l.to)}
              </span>
              <span className="block text-muted tabular">
                {l.km != null && `${t.trip.about} ${formatNumber(l.km, lang)} ${t.routes.km} · `}
                {first.vehicle && formatSAR(displayPrice(first.legPrices[i], vat), lang)}
                {` (${lang === "ar" ? first.vehicle.nameAr : first.vehicle.nameEn})`}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <BookingForm
        lang={lang}
        t={{ route: t.route, form: t.form }}
        trips={trips}
        initialTripId={trips[0].id}
        vat={vat}
        hidden={{ stops: quote.places.map((p) => p.slug).join(",") }}
        directions={null}
        initialReversed="0"
        minDate={todayInRiyadh()}
        maxDate={maxBookingDate()}
        initialDate={isDay(sp.date) ? sp.date : ""}
        initialTime={isClock(sp.time) ? sp.time : ""}
        span={quote.minutes ? { minutes: quote.minutes, kind: "arrives" } : null}
        action={createBooking.bind(null, lang)}
      />
    </>
  );
}
