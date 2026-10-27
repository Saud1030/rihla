"use client";

import { startTransition, useActionState, useState } from "react";
import type { CancelState } from "@/app/actions/cancel";

type Labels = {
  open: string;
  phone: string;
  phoneHint: string;
  confirm: string;
  submit: string;
  sending: string;
  keep: string;
  errors: Record<NonNullable<CancelState["error"]>, string>;
};

/** Two steps so nobody cancels by accident: open, then confirm with the booking's mobile number. */
export function CancelForm({ action, labels: L }: { action: (s: CancelState, f: FormData) => Promise<CancelState>; labels: Labels }) {
  const [state, formAction, pending] = useActionState(action, {});
  const [open, setOpen] = useState(false);

  if (!open && !state.error) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost !border-danger/40 !text-danger hover:!border-danger">
        {L.open}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="space-y-4"
    >
      <label className="block">
        <span className="block text-sm font-medium mb-1">{L.phone}</span>
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          dir="ltr"
          required
          maxLength={20}
          autoComplete="tel"
          placeholder="+966"
          aria-invalid={state.error === "phone" || undefined}
          className="field text-start max-w-xs"
        />
        <span className="block text-xs text-muted mt-1">{L.phoneHint}</span>
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" name="confirm" className="size-4 mt-1 accent-sign" />
        <span className="text-[15px]">{L.confirm}</span>
      </label>
      {state.error && (
        <p className="text-sm text-danger bg-danger-soft rounded-md px-3 py-2" role="alert">
          {L.errors[state.error]}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className="btn !bg-danger !text-white">
          {pending ? L.sending : L.submit}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost" disabled={pending}>
          {L.keep}
        </button>
      </div>
    </form>
  );
}
