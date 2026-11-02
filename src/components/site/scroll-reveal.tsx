"use client";

import { useEffect } from "react";

/**
 * Sections marked data-reveal (or data-reveal-items for a row of cards) fade and rise in as they scroll into view.
 * Without this script, or with reduced motion, everything simply shows: the hiding CSS only applies once the
 * page gets the "reveal-on" class from here.
 */
export function ScrollReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const root = document.documentElement;
    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            e.target.setAttribute("data-shown", "");
            io.unobserve(e.target);
          }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    const watch = () => {
      for (const el of document.querySelectorAll("[data-reveal], [data-reveal-items]")) {
        if (seen.has(el)) continue;
        seen.add(el);
        // already on screen: show at once, no animation
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) el.setAttribute("data-shown", "");
        else io.observe(el);
      }
    };
    watch();
    root.classList.add("reveal-on");
    // sections that stream in later
    const mo = new MutationObserver(watch);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
      root.classList.remove("reveal-on");
    };
  }, []);
  return null;
}
