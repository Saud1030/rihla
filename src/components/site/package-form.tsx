"use client";

import { useActionState, useState } from "react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import type { PackageFormState } from "@/app/actions/package";
import { MorphButton } from "@/components/morph-button";
import { LockIcon } from "@/components/icons";
import { formatDate, formatTime } from "@/lib/format";
import { farEnough } from "@/lib/lead-time";
import { useEarliest } from "./use-earliest";
import { PhoneCountryField, type CountryOption } from "./phone-country-field";

type Props = {
  lang: Locale;
  t: Pick<Dictionary, "form" | "packages">;
  action: (state: PackageFormState, formData: FormData) => Promise<PackageFormState>;
  minDate: string;
  maxDate: string;
  maxPassengers: number;
  leadHours: number;
  countries: CountryOption[];
  firstNote: string;
};

/** Booking a package: when, where and who. The price and the payments come from the server. */
export function PackageForm({ lang, t, action, minDate, maxDate, maxPassengers, leadHours, countries, firstNote }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = state.values ?? {};
  const E = t.form.errors;
  const err = (k: string) => !!state.errors?.[k as keyof NonNullable<PackageFormState["errors"]>];
  const [date, setDate] = useState(v.date ?? "");
  const [time, setTime] = useState(v.time ?? "");
  const earliest = useEarliest(leadHours);
  const tooSoon = !!earliest && !!date && /^\d\d:\d\d$/.test(time) && !farEnough(date, time, earliest);
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
  const a11y = (name: string) => ({ name, id: name, "aria-invalid": err(name) || undefined, "aria-describedby": err(name) ? `${name}-error` : undefined });

  return (
    <form action={formAction} className="space-y-4" noValidate data-testid="package-form">
      {earliest && (
        <p className="text-sm text-muted">
          {t.form.earliest} {formatDate(earliest.date, lang)} - {formatTime(earliest.time, lang)}
        </p>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        {field("date", t.form.date, <input type="date" min={earliest && earliest.date > minDate ? earliest.date : minDate} max={maxDate} value={date} onChange={(e) => setDate(e.target.value)} required className="field" {...a11y("date")} />, E.date)}
        {field(
          "time",
          t.form.time,
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required className="field" {...a11y("time")} />,
          state.tooSoon || tooSoon ? E.tooSoon.replace("{hours}", String(state.tooSoon ?? leadHours)) : E.time,
        )}
      </div>
      {tooSoon && !err("time") && <p className="text-sm text-danger">{E.tooSoon.replace("{hours}", String(leadHours))}</p>}
      {field("pickup", t.form.pickup, <input type="text" minLength={2} maxLength={300} defaultValue={v.pickup ?? ""} required className="field" {...a11y("pickup")} />, E.pickup, t.form.pickupHint)}
      <div className="grid sm:grid-cols-2 gap-4">
        {field("name", t.form.name, <input type="text" autoComplete="name" maxLength={100} defaultValue={v.name ?? ""} required className="field" {...a11y("name")} />, E.name)}
        <PhoneCountryField
          key={v.phoneCountry ?? "SA"}
          countries={countries}
          defaultCountry={v.phoneCountry ?? "SA"}
          defaultValue={v.phone ?? ""}
          label={t.form.phone}
          countryLabel={t.form.phoneCountry}
          hint={t.form.phoneHint}
          error={err("phone") ? E.phone : undefined}
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {field("email", t.form.email, <input type="email" maxLength={200} defaultValue={v.email ?? ""} dir="ltr" className="field text-start" {...a11y("email")} />, E.email)}
        {field("passengers", t.form.passengers, <input type="number" min={1} max={maxPassengers} defaultValue={v.passengers ?? "1"} required className="field" {...a11y("passengers")} />, E.passengers)}
      </div>
      <p className="rounded-lg bg-sign-soft border border-sign/15 px-4 py-3 text-sm">{firstNote}</p>
      {(state.formError || state.errors) && (
        <p className="text-sm text-danger bg-danger-soft rounded-md px-3 py-2" role="alert">
          {state.formError === "package" ? t.packages.notFound : E.generic}
        </p>
      )}
      <MorphButton type="submit" busy={pending} disabled={pending} label={t.packages.submit} busyLabel={t.packages.sending} icon={<LockIcon className="size-4" />} center className="btn btn-primary w-full text-[17px]" />
      <p className="text-xs text-muted">{t.form.agree}</p>
    </form>
  );
}
