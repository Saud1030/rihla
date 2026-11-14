"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The voice assistant: a microphone button on every page. The customer speaks, the browser turns the
 * speech into text (Web Speech API, free), /api/voice answers from the site's data, and the browser reads
 * the answer aloud. When the customer asks to book, the answer comes with a page to open: the booking
 * page already filled in. Browsers without speech recognition (Firefox) can type instead.
 */

export type VoiceLabels = {
  open: string;
  close: string;
  title: string;
  greeting: string;
  hint: string;
  listening: string;
  thinking: string;
  speaking: string;
  tapToTalk: string;
  stop: string;
  placeholder: string;
  send: string;
  you: string;
  opening: string;
  micBlocked: string;
  noSpeech: string;
  unsupported: string;
  error: string;
  throttled: string;
};

type Turn = { role: "user" | "assistant"; text: string };
type Phase = "idle" | "listening" | "thinking" | "speaking";

/* the parts of the Web Speech API used here (not in TypeScript's DOM types yet) */
type RecognitionEvent = { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};
type RecognitionCtor = new () => Recognition;

const recognitionCtor = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const STORE_KEY = "rihla-voice-turns";
const KEEP_TURNS = 12;
const store = {
  load: (): Turn[] => {
    try {
      const v: unknown = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "[]");
      return Array.isArray(v) ? v.filter((t): t is Turn => (t?.role === "user" || t?.role === "assistant") && typeof t?.text === "string").slice(-KEEP_TURNS) : [];
    } catch {
      return [];
    }
  },
  save: (turns: Turn[]) => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(turns.slice(-KEEP_TURNS)));
    } catch {}
  },
};

function MicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
    </svg>
  );
}

export function VoiceAssistant({ lang, labels: L }: { lang: "ar" | "en"; labels: VoiceLabels }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [heard, setHeard] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [canListen, setCanListen] = useState(true);

  const turnsRef = useRef<Turn[]>([]);
  const phaseRef = useRef<Phase>("idle");
  const openRef = useRef(false);
  const recRef = useRef<Recognition | null>(null);
  const speakTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // listen() and send() call each other (listen -> send -> speak -> listen), so one is reached through a ref
  const listenRef = useRef<() => void>(() => {});

  const go = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const commit = useCallback((next: Turn[]) => {
    turnsRef.current = next;
    setTurns(next);
    store.save(next);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (speakTimer.current) clearTimeout(speakTimer.current);
    speakTimer.current = null;
    try {
      window.speechSynthesis?.cancel();
    } catch {}
  }, []);

  const stopListening = useCallback(() => {
    const r = recRef.current;
    recRef.current = null;
    if (!r) return;
    r.onresult = r.onerror = r.onend = null;
    try {
      r.abort();
    } catch {}
  }, []);

  /** Reads the answer aloud, then calls `then` (also when the browser has no voice, or never reports the end) */
  const speak = useCallback(
    (text: string, then: () => void) => {
      stopSpeaking();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        if (speakTimer.current) clearTimeout(speakTimer.current);
        speakTimer.current = null;
        then();
      };
      const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
      if (!synth || !text) {
        // no voice here: leave the words on screen long enough to read
        speakTimer.current = setTimeout(finish, text ? Math.min(6000, 1200 + text.length * 40) : 0);
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      const arabic = /[؀-ۿ]/.test(text);
      u.lang = arabic ? "ar-SA" : "en-US";
      const voices = synth.getVoices();
      const voice = voices.find((v) => v.lang.replace("_", "-") === u.lang) ?? voices.find((v) => v.lang.toLowerCase().startsWith(arabic ? "ar" : "en"));
      if (voice) u.voice = voice;
      u.onend = finish;
      u.onerror = finish;
      go("speaking");
      synth.speak(u);
      // some browsers never fire "end"
      speakTimer.current = setTimeout(finish, 6000 + text.length * 120);
    },
    [go, stopSpeaking],
  );

  const send = useCallback(
    async (text: string) => {
      const said = text.trim();
      if (!said || phaseRef.current === "thinking") return;
      stopListening();
      stopSpeaking();
      setHeard("");
      setError(null);
      commit([...turnsRef.current, { role: "user", text: said }]);
      go("thinking");
      try {
        const r = await fetch("/api/voice", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lang, turns: turnsRef.current }),
        });
        if (!openRef.current) return;
        if (!r.ok) {
          setError(r.status === 429 ? L.throttled : L.error);
          go("idle");
          return;
        }
        const d: { text?: string; navigate?: string | null } = await r.json();
        const answer = (d.text ?? "").trim() || (d.navigate ? L.opening : "");
        if (answer) commit([...turnsRef.current, { role: "assistant", text: answer }]);
        const target = d.navigate;
        speak(answer, () => {
          if (!openRef.current) return;
          if (target) {
            // a normal page load: the search address forwards to the right booking page
            window.location.assign(target);
            return;
          }
          go("idle");
          listenRef.current();
        });
      } catch {
        if (!openRef.current) return;
        setError(L.error);
        go("idle");
      }
    },
    [L.error, L.opening, L.throttled, commit, go, lang, speak, stopListening, stopSpeaking],
  );

  const listen = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || !openRef.current || phaseRef.current === "thinking") return;
    stopSpeaking();
    stopListening();
    setError(null);
    setHeard("");
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = lang === "ar" ? "ar-SA" : "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    let final = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) final += res[0].transcript;
        else interim += res[0].transcript;
      }
      setHeard((final + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setError(L.micBlocked);
      else if (e.error === "no-speech") setError(L.noSpeech);
      else if (e.error !== "aborted") setError(L.error);
    };
    rec.onend = () => {
      if (recRef.current !== rec) return;
      recRef.current = null;
      if (final.trim()) void send(final);
      else go("idle");
    };
    try {
      rec.start();
      go("listening");
    } catch {
      recRef.current = null;
      go("idle");
    }
  }, [L.error, L.micBlocked, L.noSpeech, go, lang, send, stopListening, stopSpeaking]);

  useEffect(() => {
    listenRef.current = listen;
  }, [listen]);

  const close = useCallback(() => {
    openRef.current = false;
    setOpen(false);
    stopListening();
    stopSpeaking();
    go("idle");
  }, [go, stopListening, stopSpeaking]);

  const show = () => {
    openRef.current = true;
    setOpen(true);
    setError(null);
    setCanListen(recognitionCtor() !== null);
    const saved = store.load();
    turnsRef.current = saved;
    setTurns(saved);
    // the tap that opens the panel also lets the browser speak; a returning customer goes straight to listening
    if (saved.length) listen();
    else speak(L.greeting, () => openRef.current && (go("idle"), listenRef.current()));
  };

  // stop the microphone and the voice when the page goes away
  useEffect(
    () => () => {
      stopListening();
      stopSpeaking();
    },
    [stopListening, stopSpeaking],
  );

  // keep the latest words in view
  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [open, turns, heard, phase]);

  const status = phase === "listening" ? L.listening : phase === "thinking" ? L.thinking : phase === "speaking" ? L.speaking : canListen ? L.tapToTalk : L.unsupported;
  const busy = phase === "thinking";

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={show}
          aria-label={L.open}
          title={L.open}
          className="fixed bottom-24 end-5 z-40 grid place-items-center size-14 rounded-full bg-paper text-sign border border-line shadow-lg hover:bg-sign-soft"
          data-testid="voice-launcher"
        >
          <MicIcon className="size-7" />
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-label={L.title}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
          className="fixed z-50 inset-x-3 bottom-24 sm:inset-x-auto sm:end-5 sm:w-[380px] max-h-[min(560px,calc(100dvh-8rem))] flex flex-col rounded-2xl bg-paper text-ink border border-line shadow-2xl overflow-hidden"
          data-testid="voice-panel"
        >
          <header className="flex items-center justify-between gap-3 px-4 py-3 bg-sign text-white">
            <h2 className="font-semibold">{L.title}</h2>
            <button type="button" onClick={close} aria-label={L.close} className="grid place-items-center size-8 rounded-full hover:bg-white/15">
              <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
                <path d="m5 5 10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          <div ref={listRef} className="flex-1 min-h-24 overflow-y-auto px-4 py-3 space-y-2.5 text-sm" aria-live="polite">
            {!turns.length && (
              <>
                <p className="rounded-xl bg-sign-soft px-3 py-2 max-w-[85%]">{L.greeting}</p>
                <p className="text-muted text-xs">{L.hint}</p>
              </>
            )}
            {turns.map((t, i) =>
              t.role === "user" ? (
                <p key={i} className="ms-auto w-fit max-w-[85%] rounded-xl bg-ink/5 px-3 py-2">
                  <span className="sr-only">{L.you}: </span>
                  {t.text}
                </p>
              ) : (
                <p key={i} className="w-fit max-w-[85%] rounded-xl bg-sign-soft px-3 py-2">
                  {t.text}
                </p>
              ),
            )}
            {heard && <p className="ms-auto w-fit max-w-[85%] rounded-xl bg-ink/5 px-3 py-2 text-muted">{heard}</p>}
          </div>

          {error && (
            <p role="alert" className="mx-4 mb-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-red-700" data-testid="voice-error">
              {error}
            </p>
          )}

          <div className="border-t border-line px-4 py-3 flex flex-col items-center gap-2">
            {canListen && (
              <button
                type="button"
                disabled={busy}
                onClick={() => (phase === "listening" ? (stopListening(), go("idle")) : listen())}
                aria-label={phase === "listening" ? L.stop : L.tapToTalk}
                aria-pressed={phase === "listening"}
                className={`relative grid place-items-center size-16 rounded-full text-white shadow-md disabled:opacity-60 ${phase === "listening" ? "bg-red-600 hover:bg-red-700" : "bg-sign hover:bg-sign-deep"}`}
                data-testid="voice-mic"
              >
                {phase === "listening" && <span className="absolute inset-0 rounded-full bg-red-600/40 motion-safe:animate-ping" aria-hidden="true" />}
                <MicIcon className="relative size-8" />
              </button>
            )}
            <p className="text-sm text-muted text-center" data-testid="voice-status">
              {status}
            </p>
            <form
              className="flex w-full gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const v = typed;
                setTyped("");
                void send(v);
              }}
            >
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={L.placeholder}
                aria-label={L.placeholder}
                maxLength={500}
                className="flex-1 min-w-0 rounded-lg border border-line bg-paper px-3 py-2 text-sm"
                data-testid="voice-input"
              />
              <button type="submit" disabled={busy || !typed.trim()} className="btn btn-primary px-4 py-2 text-sm disabled:opacity-60">
                {L.send}
              </button>
            </form>
          </div>
        </section>
      )}
    </>
  );
}
