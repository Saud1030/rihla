"use client";

import { useEffect, useRef, useState } from "react";

/** The numbers strip: each number counts up once, when the strip scrolls into view */
export function HomeStats({ stats, lang }: { stats: { value: number; label: string }[]; lang: "ar" | "en" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1); // 0..1 of the way up; starts complete so it reads right without scripts or motion
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - t0) / 1400);
          setK(1 - Math.pow(1 - p, 3));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        setK(0);
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <section className="bg-sign-deep text-white" data-testid="home-stats">
      <div ref={ref} className="mx-auto max-w-6xl px-4 py-10 grid grid-cols-2 gap-y-8 gap-x-4 md:grid-cols-4 text-center">
        {stats.map((s, i) => (
          <div key={i}>
            <p className="font-display font-bold text-4xl md:text-5xl text-amber tabular" dir="ltr" aria-label={s.value.toLocaleString("en-US")}>
              {Math.round(s.value * k).toLocaleString("en-US")}
            </p>
            <p className="mt-2 text-white/85" lang={lang}>
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
