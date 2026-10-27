"use client";

import { useEffect, useState } from "react";

export type Slide = { id: number; src: string; title: string; text: string; link: string; external: boolean };

/** Home banners: one at a time, changing every 6 seconds (paused on hover/focus or with reduced motion) */
export function BannerSlider({ slides, labels }: { slides: Slide[]; labels: { prev: string; next: string; slide: string; region: string } }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const many = slides.length > 1;

  useEffect(() => {
    if (!many || paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((x) => (x + 1) % slides.length), 6000);
    return () => clearInterval(id);
  }, [many, paused, slides.length]);

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
    >
      <div className="grid rounded-2xl overflow-hidden bg-stone border border-line">
        {slides.map((s, n) => {
          const body = (
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
              className={`relative [grid-area:1/1] transition-opacity duration-500 ${n === i ? "opacity-100" : "opacity-0 pointer-events-none"}`}
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
