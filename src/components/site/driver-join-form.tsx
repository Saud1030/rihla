"use client";

import { useActionState, useState } from "react";
import { applyAsDriver, type JoinState } from "@/app/actions/driver-apply";
import { DOC_KINDS, DOC_LABELS, DRIVER_PHOTO_MAX } from "@/lib/driver-docs";
import type { Dictionary, Locale } from "@/i18n/dictionaries";

type Vehicle = { id: number; name: string };

/** One photo slot: picks an image, refuses anything over 1 MB right away, shows a preview */
function PhotoField({ name, label, t, invalid }: { name: string; label: string; t: Dictionary["join"]; invalid: boolean }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [tooBig, setTooBig] = useState(false);
  return (
    <div className={`rounded-xl border-2 border-dashed p-3 ${invalid || tooBig ? "border-danger" : preview ? "border-sign/40" : "border-line"}`} data-photo={name}>
      <p className="text-sm font-medium mb-2">{label}</p>
      <label className="flex items-center gap-3 cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sign rounded-lg">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file
          <img src={preview} alt="" className="size-16 rounded-lg object-cover bg-stone" />
        ) : (
          <span className="grid place-items-center size-16 rounded-lg bg-stone text-muted text-2xl" aria-hidden>
            +
          </span>
        )}
        <span className="text-sm text-sign font-medium">{preview ? t.change : t.pick}</span>
        <input
          type="file"
          name={name}
          accept="image/png,image/jpeg,image/webp"
          required
          className="sr-only"
          aria-label={label}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (preview) URL.revokeObjectURL(preview);
            if (f && f.size > DRIVER_PHOTO_MAX) {
              e.target.value = ""; // never sent
              setTooBig(true);
              setPreview(null);
              return;
            }
            setTooBig(false);
            setPreview(f ? URL.createObjectURL(f) : null);
          }}
        />
      </label>
      {tooBig && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {t.tooBig}
        </p>
      )}
    </div>
  );
}

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
        <a href="/admin/login" className="btn btn-primary mt-5">
          {t.login}
        </a>
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
            <input name="carColor" required minLength={2} maxLength={30} defaultValue={v.carColor} className="field" aria-invalid={E.color || undefined} />
            {err("color")}
          </label>
          <label className="block">
            <span className="block text-sm font-medium mb-1">{t.plate}</span>
            <input name="plateNumber" required minLength={2} maxLength={30} defaultValue={v.plateNumber} className="field" aria-invalid={E.plate || undefined} />
            <span className="block text-xs text-muted mt-1">{t.plateHint}</span>
            {err("plate")}
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
