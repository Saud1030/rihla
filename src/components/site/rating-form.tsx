"use client";

import { useActionState, useState } from "react";
import { submitRating, type RateState } from "@/app/actions/rating";
import type { Dictionary } from "@/i18n/dictionaries";

function StarPicker({ name, label, words }: { name: string; label: string; words: string[] }) {
  const [v, setV] = useState(0);
  const [hover, setHover] = useState(0);
  const shown = hover || v;
  return (
    <fieldset className="space-y-2">
      <legend className="font-medium">{label}</legend>
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer" onMouseEnter={() => setHover(n)}>
            <input type="radio" name={name} value={n} className="sr-only peer" onChange={() => setV(n)} required />
            <span className="sr-only">{`${n} - ${words[n - 1]}`}</span>
            <svg viewBox="0 0 20 20" className="size-10 transition-transform peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-amber rounded hover:scale-110" aria-hidden>
              <path d="M10 1.5l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L1.4 7.8l6-.8z" fill={n <= shown ? "var(--color-amber)" : "var(--color-line)"} />
            </svg>
          </label>
        ))}
        <span className="ms-2 text-sm text-muted min-w-20" aria-live="polite">
          {shown ? words[shown - 1] : ""}
        </span>
      </div>
    </fieldset>
  );
}

export function RatingForm({ token, t }: { token: string; t: Dictionary["rate"] }) {
  const [state, action, pending] = useActionState<RateState, FormData>(submitRating, {});
  if (state.done)
    return (
      <div role="status" className="text-center py-6" data-testid="rating-thanks">
        <p className="text-5xl" aria-hidden>
          ★
        </p>
        <p className="mt-3 text-2xl font-semibold">{t.thanks}</p>
        <p className="mt-1 text-muted">{t.thanksLead}</p>
      </div>
    );
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="token" value={token} />
      <StarPicker name="driverStars" label={t.driver} words={t.stars} />
      <StarPicker name="companyStars" label={t.company} words={t.stars} />
      <label className="block">
        <span className="block font-medium mb-1">{t.comment}</span>
        <textarea name="comment" rows={4} maxLength={1000} className="field" />
        <span className="block text-xs text-muted mt-1">{t.commentHint}</span>
      </label>
      {state.error && (
        <p role="alert" className="text-danger">
          {state.error === "invalid" ? t.invalid : t.pick}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary w-full sm:w-auto">
        {pending ? t.sending : t.send}
      </button>
    </form>
  );
}
