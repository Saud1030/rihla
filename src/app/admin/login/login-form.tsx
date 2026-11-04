"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { login } from "../actions";

/**
 * The sign-in card: glass, leaning a little toward the pointer; labels float up when typing;
 * "دخول" turns into a spinner, then a green tick "أهلًا بعودتك!" (and the car flashes its lights) before the panel opens.
 */
export function LoginForm({ brand }: { brand: React.ReactNode }) {
  const [state, action, pending] = useActionState(login, {});
  const [show, setShow] = useState(false);
  const card = useRef<HTMLFormElement>(null);
  const done = !!state.ok && !!state.to;

  // lean toward the pointer (not while typing on a phone)
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || matchMedia("(pointer: coarse)").matches) return;
    const move = (e: PointerEvent) => {
      const el = card.current;
      if (!el) return;
      const x = e.clientX / innerWidth - 0.5;
      const y = e.clientY / innerHeight - 0.5;
      el.style.setProperty("--rx", `${(-y * 6).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(x * 8).toFixed(2)}deg`);
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);

  // signed in: the tick shows, the car flashes, then the panel opens
  useEffect(() => {
    if (!done) return;
    document.documentElement.dataset.welcome = "1";
    const t = setTimeout(() => window.location.assign(state.to!), 1100);
    return () => clearTimeout(t);
  }, [done, state.to]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); // keep the email filled in after a wrong password
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };

  return (
    <form ref={card} onSubmit={onSubmit} className="login-card" data-state={done ? "done" : pending ? "busy" : state.error ? "error" : "idle"}>
      <div className="mb-6">
        <p className="text-2xl font-semibold text-white">أهلًا بعودتك</p>
        <p className="mt-1 text-sm text-white/70">سجّل دخولك إلى لوحة تحكم {brand}</p>
      </div>
      <div className="space-y-4">
        <label className="login-field">
          <input name="email" type="text" required autoComplete="username" inputMode="email" dir="ltr" placeholder=" " />
          <span>البريد الإلكتروني أو رقم الجوال</span>
        </label>
        <label className="login-field">
          <input name="password" type={show ? "text" : "password"} required autoComplete="current-password" dir="ltr" placeholder=" " />
          <span>كلمة المرور</span>
          <button type="button" className="login-eye" onClick={() => setShow((v) => !v)} aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} aria-pressed={show}>
            {show ? (
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0112 5c5 0 9 4.5 10 7-0.4 1-1.3 2.4-2.6 3.7M6.2 6.2C4.1 7.6 2.7 9.6 2 12c1 2.5 5 7 10 7 1.6 0 3.1-.4 4.4-1.1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </label>
      </div>
      {state.error && (
        <p className="mt-4 text-sm text-red-200 bg-red-500/15 border border-red-400/30 rounded-lg px-3 py-2" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending || done} className="login-btn mt-6" aria-live="polite">
        {done ? (
          <>
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
              <path d="M5 12.5l4.2 4.2L19 7" className="login-tick" />
            </svg>
            <span className="sr-only">تم الدخول</span>
          </>
        ) : pending ? (
          <>
            <span className="login-spin" aria-hidden />
            <span className="sr-only">جارٍ الدخول…</span>
          </>
        ) : (
          "دخول"
        )}
      </button>
      <p className="mt-3 h-5 text-center text-sm text-emerald-200" role="status">
        {done ? "أهلًا بعودتك!" : ""}
      </p>
    </form>
  );
}
