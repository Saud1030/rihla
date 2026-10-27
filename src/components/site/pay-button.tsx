"use client";

import { useActionState } from "react";
import type { PayState } from "@/app/actions/payment";
import { LockIcon } from "@/components/icons";

type Props = {
  action: (state: PayState, formData: FormData) => Promise<PayState>;
  labels: { pay: string; redirecting: string; gatewayError: string; notConfigured: string };
};

/** Sends the customer to MyFatoorah's payment page. */
export function PayButton({ action, labels }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <button type="submit" disabled={pending} className="btn btn-primary w-full text-[17px]">
        <LockIcon className="size-4" />
        {pending ? labels.redirecting : labels.pay}
      </button>
      {state.error && (
        <p className="text-sm text-danger bg-danger-soft rounded-md px-3 py-2" role="alert">
          {state.error === "not_configured" ? labels.notConfigured : labels.gatewayError}
        </p>
      )}
    </form>
  );
}
