"use client";

import { useActionState, useState } from "react";
import type { ReceiptState } from "@/app/actions/receipt";

type Labels = {
  title: string;
  hint: string;
  choose: string;
  change: string;
  upload: string;
  uploading: string;
  errors: Record<NonNullable<ReceiptState["error"]>, string>;
};

/** Pick a photo or PDF of the transfer receipt and send it. Works without JavaScript too. */
export function ReceiptUpload({ action, labels: L, again }: { action: (s: ReceiptState, f: FormData) => Promise<ReceiptState>; labels: Labels; again?: boolean }) {
  const [state, formAction, pending] = useActionState(action, {});
  const [name, setName] = useState("");
  return (
    <form action={formAction} className="space-y-3" data-testid="receipt-form">
      <p className="font-medium">{L.title}</p>
      <label className="flex items-center gap-3 rounded-lg border-2 border-dashed border-line hover:border-sign bg-stone/40 px-4 py-4 cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sign">
        <span className="grid place-items-center size-10 rounded-full bg-sign-soft text-sign shrink-0" aria-hidden="true">
          <svg viewBox="0 0 20 20" className="size-5">
            <path d="M10 13V4m0 0L6.5 7.5M10 4l3.5 3.5M4 13v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-medium truncate">{name || (again ? L.change : L.choose)}</span>
          <span className="block text-xs text-muted">{L.hint}</span>
        </span>
        <input
          type="file"
          name="receipt"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          required
          className="sr-only"
          onChange={(e) => setName(e.target.files?.[0]?.name ?? "")}
        />
      </label>
      {state.error && (
        <p className="text-sm text-danger bg-danger-soft rounded-md px-3 py-2" role="alert">
          {L.errors[state.error]}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? L.uploading : L.upload}
      </button>
    </form>
  );
}
