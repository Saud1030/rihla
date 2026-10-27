"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import type { BookingFormState } from "@/app/actions/booking";
import { formatNumber, formatSAR, vatNote } from "@/lib/format";
import { displayPrice, withVat, type VatConfig } from "@/lib/pricing";
import { PersonIcon, BagIcon, CheckIcon, LockIcon } from "@/components/icons";
import { addToClock, formatEnd, isClock } from "@/lib/timespan";

export type FormTrip = {
  /** trip id for fixed routes, "d:<vehicleId>" for distance-priced trips */
  id: string;
  price: number;
  compareAtPrice: number | null;
  name: string;
  category: string;
  categoryLabel: string;
  passengers: number;
  bags: number;
  imageUrl: string | null;
};

type Props = {
  lang: Locale;
  t: Pick<Dictionary, "route" | "form">;
  trips: FormTrip[];
  initialTripId: string;
  vat: VatConfig;
  /** extra hidden fields, e.g. from/to for distance trips */
  hidden?: Record<string, string>;
  directions: { label: string; value: "0" | "1" }[] | null;
  initialReversed: "0" | "1";
  minDate: string;
  maxDate: string;
  /** chosen on the home page */
  initialDate?: string;
  initialTime?: string;
  /** how long the booking lasts: hourly package, or the estimated drive for transfers */
  span?: { minutes: number; kind: "ends" | "arrives" } | null;
  action: (state: BookingFormState, formData: FormData) => Promise<BookingFormState>;
};

export function BookingForm({ lang, t, trips, initialTripId, vat, hidden = {}, directions, initialReversed, minDate, maxDate, initialDate = "", initialTime = "", span = null, action }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = state.values ?? {};
  const [tripId, setTripId] = useState<string>(v.tripId || initialTripId);
  const trip = trips.find((x) => x.id === tripId) ?? trips[0];
  const money = withVat(trip.price, vat.rateBp);
  const err = (k: string) => !!state.errors?.[k as keyof NonNullable<BookingFormState["errors"]>];
  const E = t.form.errors;
  const [date, setDate] = useState(v.date ?? initialDate);
  const [time, setTime] = useState(v.time ?? initialTime);
  const end = span && isClock(time) ? addToClock(date || null, time, span.minutes) : null;
  const endText = end && span ? `${span.kind === "ends" ? t.form.endsAt : t.form.arrivesAround} ${formatEnd(end.time, end.dayOffset, lang)}` : null;

  const field = (name: string, label: string, input: React.ReactNode, error?: string, hint?: string) => (
    <label className="block">
      <span className="block text-sm font-medium mb-1">{label}</span>
      {input}
      {hint && !err(name) && <span className="block text-xs text-muted mt-1">{hint}</span>}
      {err(name) && error && (
        <span className="block text-sm text-danger mt-1" id={`${name}-error`}>
          {error}
        </span>
      )}
    </label>
  );
  const a11y = (name: string) => ({
    name,
    id: name,
    "aria-invalid": err(name) || undefined,
    "aria-describedby": err(name) ? `${name}-error` : undefined,
  });

  return (
    <form action={formAction} className="grid gap-10 lg:grid-cols-[1fr_340px] items-start" noValidate>
      {Object.entries(hidden).map(([k, val]) => (
        <input key={k} type="hidden" name={k} value={val} />
      ))}
      <div className="space-y-10 min-w-0">
        {/* Step 1: vehicle */}
        <fieldset>
          <legend className="text-xl font-semibold mb-1">{t.route.chooseVehicle}</legend>
          {vat.rateBp > 0 && <p className="text-sm text-muted mb-4">{vatNote(vat, lang)}</p>}
          <div className="grid gap-2" role="radiogroup">
            {trips.map((x) => {
              const active = x.id === trip.id;
              return (
                <label
                  key={x.id}
                  className={`relative grid grid-cols-[88px_1fr_auto] items-center gap-4 rounded-xl border px-4 py-3 cursor-pointer bg-paper ${
                    active ? "border-sign ring-2 ring-sign" : "border-line hover:border-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name="tripId"
                    value={x.id}
                    checked={active}
                    onChange={() => setTripId(x.id)}
                    className="sr-only"
                  />
                  <Image src={x.imageUrl ?? `/vehicles/${x.category}.svg`} alt="" width={88} height={37} className="w-[88px] h-auto rtl:-scale-x-100" unoptimized />
                  <span className="min-w-0">
                    <span className="block font-semibold">{x.name}</span>
                    <span className="flex flex-wrap gap-x-4 text-sm text-muted tabular">
                      <span>{x.categoryLabel}</span>
                      <span className="inline-flex items-center gap-1">
                        <PersonIcon className="size-4" /> {formatNumber(x.passengers, lang)} {t.route.passengers}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <BagIcon className="size-4" /> {formatNumber(x.bags, lang)} {t.route.bags}
                      </span>
                    </span>
                  </span>
                  <span className="text-end">
                    {x.compareAtPrice && x.compareAtPrice > x.price && (
                      <span className="block text-xs text-muted line-through tabular">{formatSAR(displayPrice(x.compareAtPrice, vat), lang)}</span>
                    )}
                    <span className="block font-display font-semibold text-lg tabular">{formatSAR(displayPrice(x.price, vat), lang)}</span>
                  </span>
                  {active && (
                    <span className="absolute -top-2.5 start-4 inline-flex items-center gap-1 rounded-full bg-sign text-white text-xs px-2 py-0.5">
                      <CheckIcon className="size-3" />
                      {t.route.selected}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          {state.formError === "trip" && <p className="mt-3 text-danger">{E.trip}</p>}
        </fieldset>

        {/* Step 2: details */}
        <fieldset className="space-y-5">
          <legend className="text-xl font-semibold mb-4">{t.route.yourDetails}</legend>

          {directions ? (
            <div>
              <span className="block text-sm font-medium mb-1">{t.route.direction}</span>
              <div className="grid sm:grid-cols-2 gap-2">
                {directions.map((d) => (
                  <label key={d.value} className="flex items-center gap-3 rounded-lg border border-line bg-paper px-3 py-2.5 cursor-pointer has-[:checked]:border-sign has-[:checked]:bg-sign-soft">
                    <input type="radio" name="reversed" value={d.value} defaultChecked={(v.reversed || initialReversed) === d.value} className="accent-sign size-4" />
                    <span className="text-[15px]">{d.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <input type="hidden" name="reversed" value="0" />
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            {field(
              "date",
              t.form.date,
              <input type="date" min={minDate} max={maxDate} value={date} onChange={(e) => setDate(e.target.value)} required className="field" {...a11y("date")} />,
              E.date,
            )}
            {field("time", t.form.time, <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required className="field" {...a11y("time")} />, E.time)}
            {endText && (
              <p className="sm:col-span-2 -mt-2 text-sm bg-sign-soft border border-sign/15 rounded-lg px-3 py-2" data-testid="form-end">
                {endText}
              </p>
            )}
            {field(
              "passengers",
              t.form.passengers,
              <input type="number" min={1} max={trip.passengers} defaultValue={v.passengers ?? "1"} required className="field tabular" {...a11y("passengers")} />,
              E.passengers,
            )}
            {field(
              "bags",
              t.form.bags,
              <input type="number" min={0} max={trip.bags} defaultValue={v.bags ?? "1"} className="field tabular" {...a11y("bags")} />,
              E.bags,
            )}
          </div>

          {field("pickup", t.form.pickup, <input type="text" maxLength={300} defaultValue={v.pickup ?? ""} required className="field" {...a11y("pickup")} />, E.pickup, t.form.pickupHint)}
          <div className="grid sm:grid-cols-2 gap-4">
            {field("dropoff", t.form.dropoff, <input type="text" maxLength={300} defaultValue={v.dropoff ?? ""} className="field" {...a11y("dropoff")} />)}
            {field("flight", t.form.flight, <input type="text" maxLength={20} defaultValue={v.flight ?? ""} className="field" dir="ltr" {...a11y("flight")} />)}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {field("name", t.form.name, <input type="text" autoComplete="name" maxLength={100} defaultValue={v.name ?? ""} required className="field" {...a11y("name")} />, E.name)}
            {field(
              "phone",
              t.form.phone,
              <input type="tel" maxLength={20} autoComplete="tel" inputMode="tel" dir="ltr" defaultValue={v.phone ?? ""} required className="field text-start" placeholder="05XXXXXXXX" {...a11y("phone")} />,
              E.phone,
              t.form.phoneHint,
            )}
          </div>
          {field("email", t.form.email, <input type="email" maxLength={200} autoComplete="email" dir="ltr" defaultValue={v.email ?? ""} className="field text-start" {...a11y("email")} />, E.email)}
          {field("notes", t.form.notes, <textarea rows={3} maxLength={1000} defaultValue={v.notes ?? ""} className="field" {...a11y("notes")} />)}
        </fieldset>
      </div>

      {/* Summary */}
      <aside className="lg:sticky lg:top-4 bg-paper border border-line rounded-xl p-5">
        <p className="font-semibold">{trip.name}</p>
        <p className="text-sm text-muted">{trip.categoryLabel}</p>
        {isClock(time) && (
          <p className="mt-3 text-sm tabular">
            {t.form.time}: {formatEnd(time, 0, lang)}
            {end ? ` ${lang === "ar" ? "←" : "→"} ${formatEnd(end.time, end.dayOffset, lang)}` : ""}
          </p>
        )}
        <dl className="mt-4 pt-4 border-t border-line space-y-1.5 text-[15px] tabular" aria-live="polite">
          {vat.rateBp > 0 && (
            <>
              <div className="flex justify-between">
                <dt className="text-muted">{t.form.subtotal}</dt>
                <dd>{formatSAR(money.subtotal, lang)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">
                  {t.form.vat} ({formatNumber(vat.rateBp / 100, lang)}٪)
                </dt>
                <dd>{formatSAR(money.vat, lang)}</dd>
              </div>
            </>
          )}
          <div className="flex items-baseline justify-between pt-1.5">
            <dt className="text-muted">{t.form.total}</dt>
            <dd className="font-display text-2xl font-semibold">{formatSAR(money.total, lang)}</dd>
          </div>
        </dl>
        {(state.formError === "generic" || state.errors) && (
          <p className="mt-4 text-sm text-danger bg-danger-soft rounded-md px-3 py-2" role="alert">
            {E.generic}
          </p>
        )}
        <button type="submit" disabled={pending} className="btn btn-primary w-full mt-5 text-[17px]">
          <LockIcon className="size-4" />
          {pending ? t.form.sending : t.form.continue}
        </button>
        <p className="mt-3 text-xs text-muted">{t.form.agree}</p>
      </aside>
    </form>
  );
}
