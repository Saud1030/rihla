"use client";

import { useState } from "react";
import { flag } from "@/lib/countries";

export type CountryOption = { iso: string; code: string; name: string };

/** WhatsApp number: country (all countries, flag and calling code) + the number */
export function PhoneCountryField({
  countries,
  defaultCountry,
  defaultValue,
  label,
  countryLabel,
  hint,
  error,
}: {
  countries: CountryOption[];
  defaultCountry: string;
  defaultValue: string;
  label: string;
  countryLabel: string;
  hint: string;
  error?: string;
}) {
  const [iso, setIso] = useState(countries.some((c) => c.iso === defaultCountry) ? defaultCountry : "SA");
  const cur = countries.find((c) => c.iso === iso) ?? countries[0];
  return (
    <div>
      <label htmlFor="phone" className="block text-sm font-medium mb-1">
        {label}
      </label>
      {/* number reads left to right: +966 | 5XXXXXXXX */}
      <div className="flex gap-2" dir="ltr">
        <div className="relative shrink-0" data-testid="phone-country">
          <span aria-hidden className="field flex items-center gap-1.5 !w-auto pe-7 whitespace-nowrap tabular pointer-events-none">
            <span className="text-lg leading-none">{flag(cur.iso)}</span>+{cur.code}
            <svg viewBox="0 0 20 20" className="absolute end-2 top-1/2 -translate-y-1/2 size-4 text-muted" aria-hidden>
              <path d="m5 8 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </span>
          <select
            name="phoneCountry"
            // uncontrolled like the other fields: after a send, the form is reset to what the server sent back
            defaultValue={defaultCountry}
            key={defaultCountry}
            onChange={(e) => setIso(e.target.value)}
            aria-label={countryLabel}
            className="absolute inset-0 w-full cursor-pointer opacity-0"
          >
            {countries.map((c) => (
              <option key={c.iso} value={c.iso}>
                {flag(c.iso)} {c.name} +{c.code}
              </option>
            ))}
          </select>
        </div>
        <input
          type="tel"
          id="phone"
          name="phone"
          maxLength={20}
          autoComplete="tel-national"
          inputMode="tel"
          defaultValue={defaultValue}
          required
          className="field text-start min-w-0 flex-1"
          placeholder={iso === "SA" ? "05XXXXXXXX" : ""}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? "phone-error" : "phone-hint"}
        />
      </div>
      {error ? (
        <span className="block text-sm text-danger mt-1" id="phone-error">
          {error}
        </span>
      ) : (
        <span className="block text-xs text-muted mt-1" id="phone-hint">
          {hint}
        </span>
      )}
    </div>
  );
}
