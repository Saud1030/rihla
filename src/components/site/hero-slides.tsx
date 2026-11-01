"use client";

import { useEffect, useState } from "react";

/**
 * The background photos behind the home page's top section, shown exactly as uploaded (no veil, no zoom).
 * With more than one, they take turns with a soft cross-fade; with animation off the first one stays.
 * Reduced-motion users get a still photo.
 */
export function HeroSlides({ urls, animate, seconds }: { urls: string[]; animate: boolean; seconds: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!animate || urls.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((x) => (x + 1) % urls.length), seconds * 1000);
    return () => clearInterval(id);
  }, [animate, urls.length, seconds]);

  return (
    <div className="absolute inset-0 overflow-hidden" data-animate={animate ? "1" : "0"}>
      {urls.map((u, n) => (
        // eslint-disable-next-line @next/next/no-img-element -- served from our own API route
        <img
          key={u}
          src={u}
          alt=""
          fetchPriority={n === 0 ? "high" : "low"}
          loading={n === 0 ? "eager" : "lazy"}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-[1500ms] ${n === i ? "opacity-100" : "opacity-0"}`}
        />
      ))}
    </div>
  );
}
