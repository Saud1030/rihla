"use client";

import Link from "next/link";
import { useActionState } from "react";
import { applyAsDriver, type JoinState } from "@/app/actions/driver-apply";
import { DOC_KINDS, DOC_LABELS } from "@/lib/driver-docs";
import { PhotoField } from "./photo-field";
import { ColorSelect, PlateFields } from "@/components/plate-fields";
import type { Dictionary, Locale } from "@/i18n/dictionaries";

type Vehicle = { id: number; name: string };

export function DriverJoinForm({ lang, t, vehicles, years }: { lang: Locale; t: Dictionary["join"]; vehicles: Vehicle[]; years: string[] }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(applyAsDriver, {});
  const E = state.errors ?? {};
  const v = state.values ?? {};
  if (state.done)
    return (
      <div role="status" className="rounded-xl border-2 border-sign/30 bg-paper p-6 text-center" data-testid="join-done">
        <p className="text-4xl" aria-hidden>
          ✓
        </p>
        <h2 className="mt-2 text-2xl font-semibold">{t.doneTitle}</h2>
        <p className="mt-2 text-muted max-w-[50ch] mx-auto">{t.doneLead}</p>
        <Link href="/admin/login" className="btn btn-primary mt-5">
          {t.login}
        </Link>
      </div>
    );

  const err = (k: keyof NonNullable<JoinState["errors"]>) =>
    E[k] ? (
      <span className="block text-xs text-danger mt-1" role="alert">
        {t.errors[k]}
      </span>
    ) : null;
  const L = (k: keyof typeof DOC_LABELS) => DOC_LABELS[k][lang];

  return (
    <form action={action} className="space-y-6" noValidate={false}>
      <section className="rounded-xl border border-line bg-paper p-5 space-y-4">
        <h2 className="font-semibold text-lg">{t.personal}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="block text-sm font-medium mb-1">{t.name}</span>
            <input name="name" required minLength={3} maxLength={80} defaultValue={v.name} autoComplete="name" className="field" aria-invalid={E.name || undefined} />
            {err("name")}
          </label>
          <label className="block">
            <span className="block text-sm font-medium mb-1">{t.phone}</span>
            <input name="phone" type="tel" required maxLength={20} defaultValue={v.phone} dir="ltr" inputMode="tel" autoComplete="tel" placeholder="05XXXXXXXX" className="field text-start" aria-invalid={E.phone || undefined} />
            <span className="block text-xs text-muted mt-1">{t.phoneHint}</span>
            {err("phone")}
          </label>
          <label className="block sm:col-span-2">
            <span className="block text-sm font-medium mb-1">{t.password}</span>
            <input name="password" type="password" required minLength={8} maxLength={100} dir="ltr" autoComplete="new-password" className="field text-start" aria-invalid={E.password || undefined} />
            <span className="block text-xs text-muted mt-1">{t.passwordHint}</span>
            {err("password")}
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-paper p-5 space-y-4">
        <h2 className="font-semibold text-lg">{t.car}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="block text-sm font-medium mb-1">{t.vehicle}</span>
            <select name="vehicleId" required defaultValue={v.vehicleId ?? ""} className="field" aria-invalid={E.vehicle || undefined}>
              <option value="" disabled>
                {t.choose}
              </option>
              {vehicles.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            {err("vehicle")}
          </label>
          <label className="block">
            <span className="block text-sm font-medium mb-1">{t.model}</span>
            <select name="carModel" required defaultValue={v.carModel ?? ""} className="field" aria-invalid={E.model || undefined}>
              <option value="" disabled>
                {t.choose}
              </option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            {err("model")}
          </label>
          <label className="block">
            <span className="block text-sm font-medium mb-1">{t.color}</span>
            <ColorSelect value={v.carColor} lang={lang} invalid={E.color} />
            {err("color")}
          </label>
          <div className="sm:col-span-2">
            <PlateFields value={v.plateNumber} label={t.plate} lettersLabel={t.plateLetters} digitsLabel={t.plateDigits} invalid={E.plate} />
            <span className="block text-xs text-muted mt-1">{t.plateHint}</span>
            {err("plate")}
          </div>
          <label className="block sm:col-span-2">
            <span className="block text-sm font-medium mb-1">{t.bank}</span>
            <textarea name="bankAccount" rows={3} maxLength={300} defaultValue={v.bankAccount} className="field" placeholder={t.bankPlaceholder} />
            <span className="block text-xs text-muted mt-1">{t.bankHint}</span>
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-paper p-5 space-y-3">
        <h2 className="font-semibold text-lg">{t.photos}</h2>
        <p className="text-sm text-muted">{t.photosHint}</p>
        {/* the browser forgets chosen files after a failed send, so they are chosen again */}
        <div className="grid gap-3 sm:grid-cols-2">
          {(["photo", ...DOC_KINDS] as const).map((k) => (
            <PhotoField key={k} name={k} label={L(k)} t={t} invalid={!!state.missing?.includes(k)} />
          ))}
        </div>
        {err("photo")}
      </section>

      <label className="flex items-start gap-2">
        <input type="checkbox" name="agree" required className="size-4 mt-1 accent-sign" />
        <span>{t.agree}</span>
      </label>
      {err("agree")}

      {state.formError && (
        <p role="alert" className="rounded-lg bg-danger-soft text-danger px-4 py-3">
          {t.errors[state.formError]}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary w-full sm:w-auto">
        {pending ? t.sending : t.send}
      </button>
    </form>
  );
}
