/** Read-only star rating (supports halves for averages) */
export function Stars({ value, size = "md", label }: { value: number; size?: "sm" | "md" | "lg"; label?: string }) {
  const px = size === "sm" ? "size-4" : size === "lg" ? "size-7" : "size-5";
  const v = Math.max(0, Math.min(5, value));
  return (
    <span className="inline-flex items-center gap-0.5 align-middle" role="img" aria-label={label ?? `${v.toFixed(1)} / 5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, v - i));
        return (
          <svg key={i} viewBox="0 0 20 20" className={`${px} shrink-0 rtl:-scale-x-100`} aria-hidden>
            <defs>
              <linearGradient id={`st-${i}-${Math.round(fill * 100)}`} x1="0" x2="1" y1="0" y2="0">
                <stop offset={`${fill * 100}%`} stopColor="var(--color-amber, #f5b301)" />
                <stop offset={`${fill * 100}%`} stopColor="var(--color-line, #ddd)" />
              </linearGradient>
            </defs>
            <path
              d="M10 1.5l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L1.4 7.8l6-.8z"
              fill={`url(#st-${i}-${Math.round(fill * 100)})`}
            />
          </svg>
        );
      })}
    </span>
  );
}
