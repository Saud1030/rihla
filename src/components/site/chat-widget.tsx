"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatConfig } from "@/lib/chatbot";

type Msg = { id: number; from: "customer" | "bot" | "staff" | "system"; text: string; staff?: string | null; at: string };
type Status = "bot" | "waiting" | "open" | "closed" | null;

export type ChatLabels = {
  open: string;
  close: string;
  placeholder: string;
  send: string;
  faqTitle: string;
  talkStaff: string;
  staffTitle: string;
  name: string;
  phone: string;
  ref: string;
  request: string;
  back: string;
  orWhatsapp: string;
  staffLabel: string;
  waiting: string;
  connected: string;
  closed: string;
  error: string;
  throttled: string;
  fieldErrors: { name: string; phone: string; ref: string };
};

const ACTIVE_KEY = "rihla-chat-active";
const storage = {
  get: () => {
    try {
      return localStorage.getItem(ACTIVE_KEY) === "1";
    } catch {
      return false;
    }
  },
  set: (on: boolean) => {
    try {
      if (on) localStorage.setItem(ACTIVE_KEY, "1");
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {}
  },
};

/**
 * Floating inquiry bot. Answers from the questions set in the admin panel, and hands the
 * conversation to a staff member (live, right here) and/or WhatsApp, as configured.
 */
export function ChatWidget({ lang, config: C, labels: L }: { lang: "ar" | "en"; config: ChatConfig; labels: ChatLabels }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [status, setStatus] = useState<Status>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staffForm, setStaffForm] = useState(false);
  const [fieldErr, setFieldErr] = useState<string[]>([]);
  const [unread, setUnread] = useState(false);
  const last = useRef(0);
  const loaded = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const merge = useCallback((incoming: Msg[], st: Status) => {
    if (st !== undefined) setStatus(st);
    if (!incoming.length) return;
    last.current = Math.max(last.current, ...incoming.map((m) => m.id));
    setMsgs((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      return [...prev, ...incoming.filter((m) => !seen.has(m.id))];
    });
    if (!openRef.current && incoming.some((m) => m.from === "staff")) setUnread(true);
  }, []);

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`/api/chat?after=${last.current}`, { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      merge(d.messages ?? [], d.status ?? null);
    } catch {}
  }, [merge]);

  // a conversation with a staff member continues across pages: check for replies on load
  useEffect(() => {
    if (storage.get()) {
      loaded.current = true;
      void poll();
    }
  }, [poll]);

  useEffect(() => {
    storage.set(status === "waiting" || status === "open");
  }, [status]);

  // while talking to staff: poll often when open, rarely when closed
  useEffect(() => {
    if (status !== "waiting" && status !== "open") return;
    const id = setInterval(poll, open ? 4000 : 30000);
    return () => clearInterval(id);
  }, [status, open, poll]);

  useEffect(() => {
    if (!open) return;
    if (!loaded.current) {
      loaded.current = true;
      void poll();
    }
    inputRef.current?.focus();
  }, [open, poll]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs, staffForm, open]);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, lang, after: last.current }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (d.error === "invalid") setFieldErr(d.fields ?? []);
        else setError(d.error === "throttled" ? L.throttled : L.error);
        return false;
      }
      merge(d.messages ?? [], d.status ?? null);
      return true;
    } catch {
      setError(L.error);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const live = C.handoff === "live" || C.handoff === "both";
  const wa = (C.handoff === "whatsapp" || C.handoff === "both") && C.whatsapp;
  const lastQuestion = [...msgs].reverse().find((m) => m.from === "customer")?.text ?? "";
  const waHref = wa ? `https://wa.me/${C.whatsapp}${lastQuestion ? `?text=${encodeURIComponent(lastQuestion)}` : ""}` : "";
  const withStaff = status === "waiting" || status === "open";

  function close() {
    setOpen(false);
    setStaffForm(false);
    launcherRef.current?.focus();
  }

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={() => {
          if (open) return close();
          setUnread(false);
          setOpen(true);
        }}
        aria-expanded={open}
        aria-controls="chat-panel"
        aria-label={open ? L.close : L.open}
        className="fixed bottom-5 end-5 z-50 grid place-items-center size-14 rounded-full bg-sign text-white shadow-lg hover:bg-sign-deep"
        data-testid="chat-launcher"
      >
        {open ? (
          <svg viewBox="0 0 20 20" className="size-6" aria-hidden="true">
            <path d="m5 5 10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="size-7" aria-hidden="true">
            <path
              d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5v-8Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path d="M8.5 9.5h.01M12 9.5h.01M15.5 9.5h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        )}
        {unread && !open && <span className="absolute top-1 end-1 size-3.5 rounded-full bg-amber ring-2 ring-white" aria-label="•" />}
      </button>

      {open && (
        <section
          id="chat-panel"
          role="dialog"
          aria-label={C.botName}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
          className="fixed z-50 inset-x-3 bottom-24 top-20 sm:inset-x-auto sm:end-5 sm:top-auto sm:w-[380px] sm:h-[min(580px,calc(100dvh-8rem))] flex flex-col rounded-2xl bg-paper text-ink border border-line shadow-2xl overflow-hidden"
        >
          <header className="flex items-center gap-3 px-4 py-3 bg-sign text-white">
            <span className="grid place-items-center size-9 rounded-full bg-white/15 shrink-0" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="size-5">
                <rect x="5" y="8" width="14" height="10" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 4v4M9.5 13h.01M14.5 13h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate">{C.botName}</p>
              <p className="text-xs text-white/80" aria-live="polite">
                {status === "waiting" ? L.waiting : status === "open" ? L.connected : ""}
              </p>
            </div>
            <button type="button" onClick={close} aria-label={L.close} className="grid place-items-center size-8 rounded-md hover:bg-white/10">
              <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
                <path d="m5 5 10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3 bg-stone/40" aria-live="polite" data-testid="chat-messages">
            <Bubble from="bot" text={C.greeting} />
            {msgs.map((m) => (
              <Bubble key={m.id} from={m.from} text={m.text} who={m.from === "staff" ? L.staffLabel : undefined} />
            ))}
            {status === "closed" && <p className="text-center text-xs text-muted">{L.closed}</p>}

            {!withStaff && !staffForm && C.faqs.length > 0 && (
              <div className="pt-1">
                <p className="text-xs font-semibold text-muted mb-2">{L.faqTitle}</p>
                <div className="flex flex-wrap gap-2">
                  {C.faqs.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      disabled={busy}
                      onClick={() => send({ type: "faq", id: f.id })}
                      className="rounded-full border border-sign/30 bg-paper px-3 py-1.5 text-sm text-sign hover:border-sign text-start"
                    >
                      {f.question}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {staffForm && !withStaff && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  setFieldErr([]);
                  const ok = await send({ type: "staff", name: f.get("name"), phone: f.get("phone"), ref: f.get("ref") });
                  if (ok) setStaffForm(false);
                }}
                className="rounded-xl bg-paper border border-line p-3 space-y-2.5"
                data-testid="chat-staff-form"
              >
                <p className="font-medium text-[15px]">{L.staffTitle}</p>
                {(
                  [
                    ["name", L.name, "text", "name"],
                    ["phone", L.phone, "tel", "tel"],
                    ["ref", L.ref, "text", "off"],
                  ] as const
                ).map(([n, label, type, ac]) => (
                  <label key={n} className="block">
                    <span className="block text-xs text-muted mb-1">{label}</span>
                    <input
                      name={n}
                      type={type}
                      autoComplete={ac}
                      dir={n === "name" ? undefined : "ltr"}
                      maxLength={n === "ref" ? 8 : n === "phone" ? 20 : 80}
                      aria-invalid={fieldErr.includes(n) || undefined}
                      className={`field !min-h-10 !py-2 text-[15px] ${n === "name" ? "" : "text-start"}`}
                    />
                    {fieldErr.includes(n) && <span className="block text-xs text-danger mt-1">{L.fieldErrors[n]}</span>}
                  </label>
                ))}
                <div className="flex gap-2">
                  <button type="submit" disabled={busy} className="btn btn-primary !min-h-10 !py-2 text-[15px] flex-1">
                    {L.request}
                  </button>
                  <button type="button" onClick={() => setStaffForm(false)} className="btn btn-ghost !min-h-10 !py-2 text-[15px]">
                    {L.back}
                  </button>
                </div>
                {wa && (
                  <a href={waHref} target="_blank" rel="noopener noreferrer" className="block text-center text-sm text-sign hover:underline">
                    {L.orWhatsapp}
                  </a>
                )}
              </form>
            )}
          </div>

          {error && (
            <p className="px-4 py-2 text-sm text-danger bg-danger-soft" role="alert">
              {error}
            </p>
          )}

          {!withStaff && !staffForm && (live || wa) && (
            <div className="px-3 pt-2 bg-paper">
              {live ? (
                <button type="button" onClick={() => setStaffForm(true)} className="w-full rounded-lg border border-line py-2 text-sm font-medium hover:border-sign">
                  {L.talkStaff}
                </button>
              ) : (
                <a href={waHref} target="_blank" rel="noopener noreferrer" className="block w-full rounded-lg border border-line py-2 text-center text-sm font-medium hover:border-sign">
                  {L.talkStaff}
                </a>
              )}
            </div>
          )}

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const v = text.trim();
              if (!v || busy) return;
              if (await send({ type: "ask", text: v })) setText("");
            }}
            className="flex items-end gap-2 p-3 bg-paper border-t border-line"
          >
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              rows={1}
              maxLength={1000}
              placeholder={L.placeholder}
              aria-label={L.placeholder}
              className="field !min-h-11 !py-2.5 resize-none max-h-28 text-[15px]"
            />
            <button type="submit" disabled={busy || !text.trim()} className="btn btn-primary !min-h-11 !px-4 shrink-0" aria-label={L.send}>
              <svg viewBox="0 0 20 20" className="size-5 rtl:-scale-x-100" aria-hidden="true">
                <path d="M3 10h12m0 0-5-5m5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
        </section>
      )}
    </>
  );
}

function Bubble({ from, text, who }: { from: Msg["from"]; text: string; who?: string }) {
  if (from === "system") return <p className="mx-auto max-w-[90%] text-center text-xs text-muted bg-paper border border-line rounded-lg px-3 py-2 whitespace-pre-wrap">{text}</p>;
  const mine = from === "customer";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`} data-from={from}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed whitespace-pre-wrap break-words ${
          mine ? "bg-sign text-white rounded-ee-sm" : "bg-paper border border-line rounded-es-sm"
        }`}
      >
        {who && <span className="block text-xs font-semibold text-sign mb-0.5">{who}</span>}
        {text}
      </div>
    </div>
  );
}
