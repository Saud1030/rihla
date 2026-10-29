import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { getPickerOptions, getSettings } from "@/lib/catalog";
import { maxBookingDate, todayInRiyadh } from "@/lib/booking";
import { KIND_LABELS, REGIONS } from "@/lib/regions";
import { SignSearch, type ChoiceOption } from "./sign-search";
import type { ComponentProps } from "react";

/** The search panel inside the green sign: transfer or hourly, both with from / to, date and time. */
export async function TripSearch({
  lang,
  t,
  id,
}: {
  lang: Locale;
  t: Dictionary;
  id?: string;
}) {
  return <SignSearch {...await signSearchProps(lang, t, id)} />;
}

/** Everything the chooser needs. Also used by the static preview, so it shows the same data. */
export async function signSearchProps(
  lang: Locale,
  t: Dictionary,
  id?: string,
): Promise<ComponentProps<typeof SignSearch>> {
  const [raw, settings] = await Promise.all([
    getPickerOptions(lang),
    getSettings(),
  ]);
  const options: ChoiceOption[] = raw.map((o) => ({
    slug: o.slug,
    name: o.name,
    citySlug: o.citySlug,
    city: o.city,
    regionSlug: o.regionSlug,
    kindLabel: KIND_LABELS[o.kind][lang],
  }));

  return {
    lang,
    id,
    action: `/${lang}/search`,
    options,
    regions: REGIONS.map((r) => ({ slug: r.slug, name: r[lang] })),
    hourlyEnabled: settings.hourly_enabled !== "0",
    minDate: todayInRiyadh(),
    maxDate: maxBookingDate(),
    labels: {
      transfer: t.search.transfer,
      hourly: t.search.hourly,
      from: t.hero.from,
      to: t.hero.to,
      pickupPlace: t.search.pickupPlace,
      duration: t.search.duration,
      hoursLabel: t.search.hours,
      choose: t.search.choose,
      chooseTime: t.search.chooseTime,
      date: t.form.date,
      time: t.form.time,
      endsAt: t.search.endsAt,
      showPrices: t.hero.showPrices,
      missing: t.search.missing,
      regions: t.search.regions,
      cities: t.search.cities,
      cityPrefix: t.search.cityPrefix,
      back: t.search.back,
      close: t.search.close,
      chooseFrom: t.search.chooseFrom,
      chooseTo: t.search.chooseTo,
      choosePickup: t.search.choosePickup,
      chooseDuration: t.search.chooseDuration,
      places: t.search.places,
      swap: t.search.swap,
    },
  };
}
