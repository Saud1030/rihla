import type { Booking } from "@/db/schema";
import { formatDate, formatNumber, formatSAR } from "@/lib/format";

/**
 * Small charts for the admin home, drawn as plain HTML/SVG on the server.
 * They grow in once (CSS animation, off with reduced motion); every value is also in the bar's label for screen readers.
 */

export function RevenueBars({ data }: { data: { day: string; total: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const sum = data.reduce((a, d) => a + d.total, 0);
  const best = data.reduce((a, d) => (d.total > a.total ? d : a), data[0]);
  return (
    <figure className="m-0" data-testid="revenue-chart">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <span>
          <span className="block font-semibold">الإيرادات آخر ١٤ يوم</span>
          <span className="text-xs text-muted">المدفوع في كل يوم، شامل الضريبة</span>
        </span>
        <span className="font-display text-xl font-semibold tabular">{formatSAR(sum, "ar")}</span>
      </figcaption>
      <ol className="flex h-44 items-end gap-1.5 sm:gap-2" aria-label="الإيراد اليومي">
        {data.map((d, i) => {
          const h = d.total ? Math.max(4, Math.round((d.total / max) * 100)) : 2;
          const top = d.total > 0 && d === best;
          return (
            <li key={d.day} className="group relative flex h-full flex-1 flex-col justify-end" aria-label={`${formatDate(d.day, "ar", { weekday: false })}: ${formatSAR(d.total, "ar")}`}>
              <span
                className={`chart-bar block w-full rounded-t-md ${top ? "bg-amber" : d.total ? "bg-amber/45 group-hover:bg-amber/70" : "bg-line"}`}
                style={{ height: `${h}%`, animationDelay: `${i * 40}ms` }}
              />
              <span className="chart-tip" aria-hidden>
                {formatSAR(d.total, "ar")}
              </span>
              <span className="mt-1.5 text-center text-[10px] text-muted tabular" aria-hidden>
                {formatNumber(Number(d.day.slice(8)), "ar")}
              </span>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}

const STATUS_COLORS: Partial<Record<Booking["status"], string>> = {
  completed: "#34d399",
  confirmed: "#d9b86e",
  paid: "#60a5fa",
  pending_payment: "#a8a29e",
  cancelled: "#f87171",
};

export function StatusDonut({ counts, labels }: { counts: Partial<Record<Booking["status"], number>>; labels: Record<Booking["status"], string> }) {
  const items = (Object.keys(STATUS_COLORS) as Booking["status"][]).map((k) => ({ k, n: counts[k] ?? 0 })).filter((x) => x.n > 0);
  const total = items.reduce((a, x) => a + x.n, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <figure className="m-0" data-testid="status-chart">
      <figcaption className="mb-3">
        <span className="block font-semibold">حجوزات هذا الشهر</span>
        <span className="text-xs text-muted">حسب الحالة</span>
      </figcaption>
      <div className="flex items-center gap-5">
        <div className="relative size-36 shrink-0">
          <svg viewBox="0 0 128 128" className="size-full -rotate-90" aria-hidden>
            <circle cx="64" cy="64" r={R} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="14" />
            {items.map((x, i) => {
              const len = (x.n / total) * C;
              const seg = (
                <circle
                  key={x.k}
                  className="donut-seg"
                  cx="64"
                  cy="64"
                  r={R}
                  fill="none"
                  stroke={STATUS_COLORS[x.k]}
                  strokeWidth="14"
                  strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`}
                  strokeDashoffset={-offset}
                  style={{ animationDelay: `${i * 90}ms` }}
                />
              );
              offset += len;
              return seg;
            })}
          </svg>
          <span className="absolute inset-0 grid place-content-center text-center">
            <span className="font-display text-2xl font-semibold tabular">{formatNumber(total, "ar")}</span>
            <span className="text-[11px] text-muted">حجز</span>
          </span>
        </div>
        <ul className="grid gap-1.5 text-sm min-w-0">
          {items.length ? (
            items.map((x) => (
              <li key={x.k} className="flex items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLORS[x.k] }} aria-hidden />
                <span className="text-muted truncate">{labels[x.k]}</span>
                <span className="ms-auto font-medium tabular">{formatNumber(x.n, "ar")}</span>
              </li>
            ))
          ) : (
            <li className="text-muted">لا توجد حجوزات هذا الشهر بعد.</li>
          )}
        </ul>
      </div>
    </figure>
  );
}
