import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { getDictionary, type Dictionary, type Locale } from "@/i18n/dictionaries";
import { getVatConfig, getLeadHours } from "@/lib/catalog";
import { maxBookingDate, todayInRiyadh } from "@/lib/booking";
import { formatDate, formatNumber, formatSAR, formatTime } from "@/lib/format";
import { legsFromParams, quoteMultiTrip } from "@/lib/multi";
import { displayPrice } from "@/lib/pricing";
import { isClock, isDay } from "@/lib/timespan";
import { BookingForm, type FormTrip } from "@/components/site/booking-form";
import { createBooking } from "@/app/actions/booking";
import { DirArrow } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLocale();
  return { title: getDictionary(lang).multi.title };
}

/** Several trips in one booking. /ar/multi?l1=jeddah-airport,makkah,2026-11-03,10:00&l2=makkah,madinah,2026-11-05,09:00 */
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
  const asked = legsFromParams(sp);
  const [quote, vat] = await Promise.all([asked ? quoteMultiTrip(asked.map((l) => [l.from, l.to])) : null, getVatConfig()]);
  if (!asked || !quote || !quote.options.length) {
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
  const arrow = lang === "ar" ? "←" : "→";

  return (
    <>
      <header className="mt-4 mb-6">
        <p className="text-sm text-sign font-medium">{t.multi.title}</p>
        <h1 className="text-3xl md:text-4xl font-semibold text-balance">
          {formatNumber(quote.legs.length, lang)} {t.multi.legs}: {quote.legs.map((l) => `${name(l.from)} ${arrow} ${name(l.to)}`).join(lang === "ar" ? "، " : ", ")}
        </h1>
        <p className="mt-3 text-sm bg-sign-soft border border-sign/15 rounded-lg px-4 py-2.5 max-w-[70ch]">{t.multi.lead}</p>
      </header>

      <section className="mb-8" aria-label={t.multi.legs}>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="multi-legs">
          {quote.legs.map((l, i) => (
            <li key={i} className="rounded-lg border border-line bg-paper px-4 py-3 text-sm">
              <span className="block text-xs text-muted">
                {t.multi.leg} {formatNumber(i + 1, lang)}
                {asked[i].date && ` · ${formatDate(asked[i].date, lang, { weekday: false })}${asked[i].time ? ` ${formatTime(asked[i].time, lang)}` : ""}`}
              </span>
              <span className="block font-medium">
                {name(l.from)} {arrow} {name(l.to)}
              </span>
              <span className="block text-muted tabular">
                {l.km != null && `${t.trip.about} ${formatNumber(l.km, lang)} ${t.routes.km} · `}
                {formatSAR(displayPrice(first.legPrices[i], vat), lang)}
                {` (${lang === "ar" ? first.vehicle.nameAr : first.vehicle.nameEn})`}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <BookingForm
        leadHours={await getLeadHours()}
        lang={lang}
        t={{ route: t.route, form: t.form }}
        trips={trips}
        initialTripId={trips[0].id}
        vat={vat}
        hidden={{ legs: quote.legs.map((l) => `${l.from.slug}>${l.to.slug}`).join("|") }}
        directions={null}
        initialReversed="0"
        minDate={todayInRiyadh()}
        maxDate={maxBookingDate()}
        initialDate={asked[0].date || (isDay(sp.date) ? sp.date : "")}
        initialTime={asked[0].time || (isClock(sp.time) ? sp.time : "")}
        span={quote.legs[0].minutes ? { minutes: quote.legs[0].minutes, kind: "arrives" } : null}
        action={createBooking.bind(null, lang)}
        schedule={quote.legs.slice(1).map((l, n) => ({
          index: n + 2,
          label: `${t.multi.leg} ${formatNumber(n + 2, lang)}: ${name(l.from)} ${arrow} ${name(l.to)}`,
          date: asked[n + 1].date,
          time: asked[n + 1].time,
        }))}
      />
    </>
  );
}
