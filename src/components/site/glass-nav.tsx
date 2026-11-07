"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Car, Home, Mail, Map as MapIcon, Moon, Sun, Ticket, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = { home: Home, routes: MapIcon, fleet: Car, booking: Ticket, contact: Mail };

export type GlassLink = { href: string; label: string; icon: keyof typeof ICONS; exact?: boolean };

/**
 * The site's main menu as a glass pill. The highlight ("bead") slides to the chosen page and
 * stretches on the way: its leading edge moves first, the trailing edge catches up with a small spring.
 * The moon / sun at the end switches dark and light mode.
 */
export function GlassNav({ links }: { links: GlassLink[] }) {
  const pathname = usePathname() ?? "";
  const activeIdx = links.findIndex((l) => (l.exact ? pathname === l.href : pathname === l.href || pathname.startsWith(l.href + "/")));
  // the tapped item moves the bead at once, before the next page arrives
  const [picked, setPicked] = useState<{ idx: number; from: string } | null>(null);
  const idx = picked && picked.from === pathname ? picked.idx : activeIdx;
  const box = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLAnchorElement | null)[]>([]);
  const bead = useRef<HTMLSpanElement>(null);
  const last = useRef<{ l: number; r: number } | null>(null);

  const place = useCallback(
    (animate: boolean) => {
      const c = box.current;
      const el = idx >= 0 ? items.current[idx] : null;
      const b = bead.current;
      if (!c || !b) return;
      if (!el) {
        b.style.opacity = "0";
        return;
      }
      const cr = c.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      const l = er.left - cr.left + c.scrollLeft;
      const r = cr.right - er.right - c.scrollLeft;
      const prev = last.current;
      // moving right: the right edge leads; moving left: the left edge leads
      const toRight = prev ? l > prev.l : true;
      const fast = "0.32s cubic-bezier(0.3, 1.25, 0.5, 1)";
      const slow = "0.55s cubic-bezier(0.3, 1.35, 0.45, 1) 0.06s";
      b.style.transition = animate && prev ? `left ${toRight ? slow : fast}, right ${toRight ? fast : slow}, opacity 0.2s` : "none";
      b.style.left = `${l}px`;
      b.style.right = `${r}px`;
      b.style.opacity = "1";
      last.current = { l, r };
    },
    [idx],
  );

  useLayoutEffect(() => place(true), [place]);
  useEffect(() => {
    const onResize = () => place(false);
    window.addEventListener("resize", onResize);
    document.fonts?.ready.then(() => place(false));
    return () => window.removeEventListener("resize", onResize);
  }, [place]);

  return (
    <div ref={box} className="glass-pill relative flex items-center gap-0.5 overflow-x-auto p-1" data-testid="glass-nav">
      <span ref={bead} className="glass-bead" data-bead aria-hidden />
      <nav className="contents" aria-label="Main">
        {links.map((l, i) => {
          const Icon = ICONS[l.icon];
          const on = i === idx;
          return (
            <Link
              key={l.href}
              href={l.href}
              ref={(el) => {
                items.current[i] = el;
              }}
              onClick={() => setPicked({ idx: i, from: pathname })}
              aria-current={i === activeIdx ? "page" : undefined}
              className={`relative z-10 flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 xl:px-3.5 py-2 text-[14px] font-medium transition-colors duration-300 ${on ? "text-[var(--bead-ink)]" : "text-muted hover:text-ink"}`}
            >
              <Icon className="size-4 shrink-0 lg:max-xl:hidden" aria-hidden strokeWidth={2} />
              {l.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/* ---------- dark / light mode (remembered in this browser; the device's setting until chosen) ---------- */

const read = () => document.documentElement.getAttribute("data-theme") ?? "light";
const subscribe = (cb: () => void) => {
  window.addEventListener("site-theme", cb);
  return () => window.removeEventListener("site-theme", cb);
};

export function ThemeButton({ labels }: { labels: { dark: string; light: string } }) {
  const theme = useSyncExternalStore(subscribe, read, () => "light");
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={() => {
        const next = dark ? "light" : "dark";
        const root = document.documentElement;
        root.classList.add("theme-switching");
        root.setAttribute("data-theme", next);
        try {
          localStorage.setItem("site-theme", next);
        } catch {}
        window.dispatchEvent(new Event("site-theme"));
        setTimeout(() => root.classList.remove("theme-switching"), 450);
      }}
      className="glass-pill relative z-10 grid size-9 sm:size-10 shrink-0 place-items-center rounded-full text-muted hover:text-ink transition-colors"
      aria-label={dark ? labels.light : labels.dark}
      title={dark ? labels.light : labels.dark}
      data-testid="theme-toggle"
    >
      <Sun className={`absolute size-[18px] transition-all duration-500 ${dark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0"}`} aria-hidden />
      <Moon className={`absolute size-[18px] transition-all duration-500 ${dark ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100"}`} aria-hidden />
    </button>
  );
}
