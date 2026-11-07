"use client";

import { useEffect, useState } from "react";

export type Slide = {
  id: number;
  src: string;
  title: string;
  text: string;
  link: string;
  external: boolean;
  /** artwork with an empty side: the words are written on it (mirrored for English) */
  side?: boolean;
  tone?: "dark" | "light";
  cta?: string;
};

/**
 * Home banners: one at a time, moving on by themselves (slide or fade, every few seconds; set in
 * Admin -> Background and banners). Paused on hover/focus; still for reduced-motion users.
 */
export function BannerSlider({
  slides,
  labels,
  autoplay = true,
  effect = "slide",
  seconds = 6,
  rtl = true,
}: {
  slides: Slide[];
  labels: { prev: string; next: string; slide: string; region: string };
  autoplay?: boolean;
  effect?: "slide" | "fade";
  seconds?: number;
  rtl?: boolean;
}) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const many = slides.length > 1;

  useEffect(() => {
    if (!many || !autoplay || paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((x) => (x + 1) % slides.length), seconds * 1000);
    return () => clearInterval(id);
  }, [many, autoplay, paused, slides.length, seconds]);

  const go = (d: number) => setI((x) => (x + d + slides.length) % slides.length);

  return (
    <section
      aria-roledescription="carousel"
      aria-label={labels.region}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="relative"
      data-testid="home-banners"
      data-effect={effect}
      data-autoplay={autoplay && many ? "1" : "0"}
    >
      <div className="grid rounded-2xl overflow-hidden bg-stone border border-line">
        {slides.map((s, n) => {
          const body = s.side ? (
            <SideBanner s={s} eager={n === 0} rtl={rtl} />
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- banners come from our own API route */}
              <img src={s.src} alt={s.title || ""} className="w-full h-auto block" loading={n === 0 ? "eager" : "lazy"} />
              {(s.title || s.text) && (
                <span className="absolute inset-x-0 bottom-0 p-4 sm:p-6 bg-gradient-to-t from-black/70 to-transparent text-white">
                  {s.title && <span className="block text-lg sm:text-2xl font-semibold">{s.title}</span>}
                  {s.text && <span className="block text-sm sm:text-base text-white/90 mt-0.5">{s.text}</span>}
                </span>
              )}
            </>
          );
          return (
            <div
              key={s.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${labels.slide} ${n + 1} / ${slides.length}`}
              aria-hidden={n !== i}
              className={`relative [grid-area:1/1] motion-safe:duration-700 ease-out ${effect === "fade" ? "transition-opacity" : "transition-[transform,opacity]"} ${n === i ? "opacity-100" : "opacity-0 pointer-events-none"}`}
              // slide: the next banner comes in from the reading direction's end
              style={effect === "slide" ? { transform: `translateX(${(n - i) * (rtl ? -100 : 100)}%)` } : undefined}
            >
              {s.link ? (
                <a href={s.link} tabIndex={n === i ? 0 : -1} {...(s.external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="block">
                  {body}
                </a>
              ) : (
                body
              )}
            </div>
          );
        })}
      </div>
      {many && (
        <div className="mt-3 flex items-center justify-center gap-3">
          <button type="button" onClick={() => go(-1)} aria-label={labels.prev} className="grid place-items-center size-8 rounded-full border border-line bg-paper hover:border-sign">
            <svg viewBox="0 0 20 20" className="size-4 rtl:-scale-x-100" aria-hidden="true">
              <path d="M12 5 7 10l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {slides.map((s, n) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setI(n)}
              aria-label={`${labels.slide} ${n + 1}`}
              aria-current={n === i}
              className={`h-2 rounded-full transition-all ${n === i ? "w-6 bg-sign" : "w-2 bg-line hover:bg-muted"}`}
            />
          ))}
          <button type="button" onClick={() => go(1)} aria-label={labels.next} className="grid place-items-center size-8 rounded-full border border-line bg-paper hover:border-sign">
            <svg viewBox="0 0 20 20" className="size-4 rtl:-scale-x-100" aria-hidden="true">
              <path d="m8 5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
    </section>
  );
}

/** artwork drawn with its empty side on the right (Arabic): mirrored for English, so the words keep the empty side */
function SideBanner({ s, eager, rtl }: { s: Slide; eager: boolean; rtl: boolean }) {
  const light = s.tone === "light";
  return (
    <span className="relative block" data-testid="side-banner">
      {/* eslint-disable-next-line @next/next/no-img-element -- banners come from our own API route */}
      <img
        src={s.src}
        alt=""
        loading={eager ? "eager" : "lazy"}
        className={`block w-full h-72 sm:h-auto object-cover object-left ${rtl ? "" : "-scale-x-100"}`}
      />
      {/* on phones the words sit low, over a soft veil */}
      <span
        aria-hidden="true"
        className={`absolute inset-0 sm:hidden bg-gradient-to-t ${light ? "from-[#fbf3e2] via-[#fbf3e2]/85" : "from-black/90 via-black/60"} to-transparent`}
      />
      <span className="absolute inset-0 flex items-end sm:items-center p-5 sm:p-0 sm:ps-[6%]">
        <span className="block w-full sm:w-[44%] space-y-2 lg:space-y-3">
          <span className={`block font-display font-bold leading-snug text-2xl md:text-3xl lg:text-[2.5rem] lg:leading-tight ${light ? "text-[#1c1917]" : "text-[#fbf6ea]"}`}>
            {s.title}
          </span>
          {s.text && <span className={`block sm:max-md:hidden text-[15px] lg:text-lg leading-relaxed ${light ? "text-[#4a3f33]" : "text-[#d8cfbd]"}`}>{s.text}</span>}
          {s.cta && (
            <span
              className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 lg:px-6 lg:py-3 mt-1 text-sm lg:text-base font-semibold ${light ? "bg-[#1c1917] text-[#fbf6ea]" : "bg-amber text-[#1c1917]"}`}
            >
              {s.cta}
              <span aria-hidden="true">{rtl ? "←" : "→"}</span>
            </span>
          )}
        </span>
      </span>
    </span>
  );
}
