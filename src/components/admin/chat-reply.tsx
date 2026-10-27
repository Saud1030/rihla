"use client";

import { startTransition, useActionState, useRef } from "react";
import type { ActionState } from "@/app/admin/actions";

/** Reply box: Enter sends, Shift+Enter adds a line; cleared after a successful send */
export function ChatReply({ id, action }: { id: string; action: (s: ActionState, f: FormData) => Promise<ActionState> }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await action(prev, fd);
    if (r.ok) formRef.current?.reset();
    return r;
  }, {});
  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      className="space-y-2"
    >
      <input type="hidden" name="id" value={id} />
      <label className="block">
        <span className="sr-only">الرد</span>
        <textarea
          name="text"
          rows={3}
          maxLength={2000}
          required
          placeholder="اكتب ردك للعميل…"
          className="field"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "جارٍ الإرسال…" : "إرسال الرد"}
        </button>
        <span className="text-xs text-muted">Enter للإرسال، Shift+Enter لسطر جديد</span>
        <p aria-live="polite" className="text-sm">
          {state.error && <span className="text-danger">{state.error}</span>}
        </p>
      </div>
    </form>
  );
}
