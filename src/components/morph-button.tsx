"use client";

import { useEffect, useRef } from "react";

/**
 * A button that plays a short animation while its action runs:
 *  - "delete": the bin opens and eats the label, the button closes into a circle and a ring turns until it's done
 *  - "default": the label folds into the middle, the button closes into a circle with a turning ring
 * The text stays the accessible name (aria-label), and with reduced motion only the ring shows.
 */
export function MorphButton({
  busy,
  label,
  busyLabel,
  variant = "default",
  icon,
  className = "btn btn-primary",
  center = false,
  ...rest
}: {
  busy: boolean;
  label: string;
  /** read by screen readers while busy (e.g. "جارٍ الحفظ…") */
  busyLabel?: string;
  variant?: "default" | "delete";
  /** shown before the label (the delete variant brings its own bin) */
  icon?: React.ReactNode;
  className?: string;
  /** full-width buttons close into a circle in their middle */
  center?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  const ref = useRef<HTMLButtonElement>(null);
  // the circle's size is the button's own height
  useEffect(() => {
    const el = ref.current;
    if (el && !busy) el.style.setProperty("--mb-h", `${el.offsetHeight}px`);
  }, [busy, label]);
  return (
    <button
      ref={ref}
      {...rest}
      aria-busy={busy || undefined}
      aria-label={busy && busyLabel ? busyLabel : label}
      data-morph={variant}
      data-busy={busy ? "" : undefined}
      data-center={center ? "" : undefined}
      className={`morph ${className}`}
    >
      {variant === "delete" ? <BinIcon /> : icon}
      <span className="mb-label" aria-hidden>
        {label}
      </span>
      <span className="mb-ring" aria-hidden />
    </button>
  );
}

/** a bin whose lid opens */
export function BinIcon() {
  return (
    <svg className="mb-bin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <g className="mb-lid">
        <path d="M3 6h18" />
        <path d="M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6" />
      </g>
      <path d="M5.5 6.5l1 13a2 2 0 0 0 2 1.8h7a2 2 0 0 0 2-1.8l1-13" />
      <path d="M10 11v5.5M14 11v5.5" />
    </svg>
  );
}
