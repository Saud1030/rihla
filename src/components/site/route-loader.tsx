"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CarLoader } from "./car-loader";

/**
 * When a page takes a moment to open (a tapped link, the search form), the loading car shows over the
 * page. Quick page changes never show it: it waits a quarter of a second first.
 */
export function RouteLoader({ label, mark }: { label: string; mark: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const giveUp = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  // resolves when the new page is on screen (ends the door animation's wait)
  const arrived = useRef<(() => void) | null>(null);

  useEffect(() => {
    const clear = () => {
      if (timer.current) clearTimeout(timer.current);
      if (giveUp.current) clearTimeout(giveUp.current);
      timer.current = giveUp.current = null;
    };
    const start = () => {
      clear();
      timer.current = setTimeout(() => setOn(true), 250);
      // never left on screen if no page change follows
      giveUp.current = setTimeout(() => setOn(false), 12000);
    };
    // capture phase: runs before the router's own click handler (which stops the browser's navigation)
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin")) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // same page (or an #anchor)
      start();
      // the gull-wing door: the old page lifts up while the new one settles in
      const doc = document as Document & { startViewTransition?: (cb: () => Promise<void>) => unknown };
      if (!doc.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (url.pathname.split("/")[1] !== location.pathname.split("/")[1]) return; // the other language reloads the page
      e.preventDefault(); // the link's own handler steps aside; the router is called inside the transition
      const href = url.pathname + url.search + url.hash;
      doc.startViewTransition(
        () =>
          new Promise<void>((done) => {
            const finish = () => {
              arrived.current = null;
              // one frame for the new page to paint
              requestAnimationFrame(() => done());
            };
            arrived.current = finish;
            router.push(href);
            // a slow page: stop waiting, the loading car takes over
            setTimeout(() => arrived.current === finish && finish(), 1200);
          }),
      );
    };
    const onSubmit = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement;
      // forms that open another page (the search box); forms handled on the page call preventDefault
      if (!e.defaultPrevented && (f.method || "get").toLowerCase() === "get" && f.getAttribute("action")) start();
    };
    const stop = () => {
      clear();
      setOn(false);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit);
    window.addEventListener("pageshow", stop);
    return () => {
      clear();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit);
      window.removeEventListener("pageshow", stop);
    };
  }, [router]);

  // the new page is here
  useEffect(() => {
    arrived.current?.();
    if (timer.current) clearTimeout(timer.current);
    if (giveUp.current) clearTimeout(giveUp.current);
    timer.current = giveUp.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to the router finishing a page change
    setOn(false);
  }, [pathname, search]);

  if (!on) return null;
  return (
    <div className="route-loader" data-testid="route-loader">
      <CarLoader label={label} mark={mark} />
    </div>
  );
}
