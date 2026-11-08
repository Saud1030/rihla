"use client";

import { useEffect, useRef } from "react";

/**
 * The home page promo video. Without controls it plays by itself, muted and looping (browsers only
 * allow that when muted, and React doesn't write `muted` into the server HTML, so it's set here).
 * Phones get the vertical file, wider screens the horizontal one.
 */
export function PromoVideoPlayer({ vertical, horizontal, controls, label }: { vertical: string; horizontal: string; controls: boolean; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || controls) return;
    v.muted = true;
    v.defaultMuted = true;
    // a viewer who asked for less motion starts it themselves
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      v.controls = true;
      return;
    }
    v.play().catch(() => (v.controls = true));
  }, [controls]);
  return (
    <video
      ref={ref}
      aria-label={label}
      className="block w-full max-h-[80vh] mx-auto rounded-2xl bg-black object-contain shadow-lg"
      loop
      playsInline
      controls={controls}
      preload="metadata"
    >
      {horizontal !== vertical && <source src={horizontal} media="(min-width: 768px)" />}
      <source src={vertical} />
    </video>
  );
}
