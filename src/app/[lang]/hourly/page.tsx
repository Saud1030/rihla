import { getPriceRules } from "@/lib/price-rules-server";
import type { Metadata } from "next";
import { countryOptions } from "@/lib/countries";
import Link from "next/link";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { getDictionary, type Dictionary, type Locale } from "@/i18n/dictionaries";
import { getCities, getLocations, getSettings, getVatConfig, getVehicles, getLeadHours } from "@/lib/catalog";
import { maxBookingDate, todayInRiyadh } from "@/lib/booking";
import { cleanDays, durationText, HOUR_PACKAGES, isHourPackage, MAX_DAYS } from "@/lib/policy";
import { cityHourlyPrices } from "@/lib/hourly";
import { isClock, isDay } from "@/lib/timespan";
import { BookingForm, type FormTrip } from "@/components/site/booking-form";
import { createBooking } from "@/app/actions/booking";
import { DirArrow } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLocale();
  return { title: getDictionary(lang).hourly.title };
}

/** Car with a driver for 10, 12 or 24 hours in a city. /ar/hourly?city=makkah&hours=12 (old links: ?from=<place>) */
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
  const hours = Number(sp.hours);
  // a full day can run several days ("from date to date" in the search box)
  const days = hours === 24 ? cleanDays(sp.days) : 1;
  const [locations, cities, vehicles, vat, settings] = await Promise.all([getLocations(), getCities(), getVehicles(), getVatConfig(), getSettings()]);
  // the city; old links name a place instead
  const fromPlace = typeof sp.from === "string" ? locations.find((l) => l.slug === sp.from) : undefined;
  const citySlug = typeof sp.city === "string" ? sp.city : (fromPlace?.city ?? "");
  const city = cities.find((c) => c.slug === citySlug);

  if (!city || !isHourPackage(hours) || settings.hourly_enabled === "0" || !vehicles.length) {
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

  const prices = await cityHourlyPrices(city.slug, hours, vehicles);
  const cityName = lang === "ar" ? `مدينة ${city.nameAr}` : city.nameEn;
  const trips: FormTrip[] = vehicles.map((v) => ({
    id: `h:${v.id}`,
    price: prices.get(v.id)! * days,
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
          {t.hourly.heading} · {hours === 24 ? durationText(24 * days, lang) : t.search.hours[hours]}
        </h1>
        <p className="mt-2 text-muted" data-testid="hourly-city">
          {cityName}
        </p>
        {/* switch package without going back */}
        <nav className="mt-4 flex flex-wrap gap-2" aria-label={t.search.duration}>
          {HOUR_PACKAGES.map((h) => (
            <Link
              key={h}
              href={`/${lang}/hourly?city=${city.slug}&hours=${h}${h === 24 && days > 1 ? `&days=${days}` : ""}${isDay(sp.date) ? `&date=${sp.date}` : ""}${isClock(sp.time) ? `&time=${sp.time}` : ""}`}
              aria-current={h === hours ? "page" : undefined}
              className={`rounded-full border px-4 py-1.5 text-sm ${h === hours ? "bg-sign text-white border-sign" : "bg-paper border-line hover:border-sign"}`}
            >
              {t.search.hours[h]}
            </Link>
          ))}
        </nav>
        {/* full days: how many */}
        {hours === 24 && (
          <form method="get" className="mt-3 flex flex-wrap items-end gap-2" data-testid="days-form">
            <input type="hidden" name="city" value={city.slug} />
            <input type="hidden" name="hours" value="24" />
            {isDay(sp.date) && <input type="hidden" name="date" value={sp.date} />}
            {isClock(sp.time) && <input type="hidden" name="time" value={sp.time} />}
            <label className="block">
              <span className="block text-sm font-medium mb-1">{lang === "ar" ? "عدد الأيام" : "Days"}</span>
              <select name="days" defaultValue={String(days)} className="field !min-h-10 !py-1.5 w-40">
                {Array.from({ length: MAX_DAYS }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {durationText(24 * n, lang)}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-ghost !min-h-10 !py-1.5">{lang === "ar" ? "تحديث السعر" : "Update price"}</button>
          </form>
        )}
        <p className="mt-4 text-sm bg-sign-soft border border-sign/15 rounded-lg px-4 py-2.5 max-w-[75ch]">{t.hourly.note}</p>
      </header>
      <BookingForm
        leadHours={await getLeadHours()}
        countries={countryOptions(lang)}
        rules={await getPriceRules()}
        lang={lang}
        t={{ route: t.route, form: t.form }}
        trips={trips}
        initialTripId={trips[0].id}
        vat={vat}
        hidden={{ hourlyCity: city.slug, hours: String(hours), days: String(days) }}
        directions={null}
        initialReversed="0"
        minDate={todayInRiyadh()}
        maxDate={maxBookingDate()}
        initialDate={isDay(sp.date) ? sp.date : ""}
        initialTime={isClock(sp.time) ? sp.time : ""}
        span={{ minutes: hours * 60 * days, kind: "ends" }}
        action={createBooking.bind(null, lang)}
      />
    </>
  );
}
