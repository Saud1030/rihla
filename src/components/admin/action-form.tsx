"use client";

import { startTransition, useActionState } from "react";
import type { ActionState } from "@/app/admin/actions";

/** A form bound to a server action, with a status line and a submit button. */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel = "جارٍ الحفظ…",
  children,
  className = "space-y-4",
  submitClassName = "btn btn-primary",
  submitDisabled = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  pendingLabel?: string;
  children: React.ReactNode;
  className?: string;
  submitClassName?: string;
  submitDisabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  // Submit via onSubmit instead of the action prop so React doesn't reset the
  // fields afterwards: on an error, what the admin typed stays in place.
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  };
  return (
    <form onSubmit={onSubmit} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || submitDisabled} className={submitClassName}>
          {pending ? pendingLabel : submitLabel}
        </button>
        <p aria-live="polite" className="text-sm">
          {state.error && <span className="text-danger">{state.error}</span>}
          {state.ok && state.message && <span className="text-sign">{state.message}</span>}
        </p>
      </div>
    </form>
  );
}
