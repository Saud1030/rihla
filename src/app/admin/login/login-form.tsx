"use client";

import { startTransition, useActionState } from "react";
import { login } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, {});
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); // keep the email filled in after a wrong password
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };
  return (
    <form onSubmit={onSubmit} className="bg-paper border border-line rounded-xl p-6 space-y-4">
      <label className="block">
        <span className="block text-sm font-medium mb-1">البريد الإلكتروني أو رقم الجوال</span>
        <input name="email" type="text" required autoComplete="username" inputMode="email" dir="ltr" className="field text-start" />
      </label>
      <label className="block">
        <span className="block text-sm font-medium mb-1">كلمة المرور</span>
        <input name="password" type="password" required autoComplete="current-password" dir="ltr" className="field text-start" />
      </label>
      {state.error && (
        <p className="text-sm text-danger bg-danger-soft rounded-md px-3 py-2" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "جارٍ الدخول…" : "دخول"}
      </button>
    </form>
  );
}
