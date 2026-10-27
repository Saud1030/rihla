import type { Booking } from "@/db/schema";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { formatDate, formatSAR, formatTime, formatNumber } from "@/lib/format";
import { maskPhone } from "@/lib/booking";
import { bookingEnd } from "@/lib/timespan";

export function StatusBadge({ status, t }: { status: Booking["status"]; t: Dictionary }) {
  const tone: Record<Booking["status"], string> = {
    pending_payment: "bg-amber/25 text-amber-deep",
    paid: "bg-sign-soft text-sign",
    confirmed: "bg-sign text-white",
    completed: "bg-stone text-muted",
    cancelled: "bg-danger-soft text-danger",
  };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-sm font-medium ${tone[status]}`}>{t.booking.status[status]}</span>;
}

/** Customer-facing booking summary. Phone is masked because the ref alone opens this page. */
export function BookingSummary({ b, lang, t, vatNumber }: { b: Booking; lang: Locale; t: Dictionary; vatNumber?: string }) {
  const rows: [string, React.ReactNode][] = [
    [t.checkout.route, b.routeTitle],
    [t.checkout.vehicle, b.vehicleName],
    [t.checkout.when, `${formatDate(b.pickupDate, lang)} · ${formatTime(b.pickupTime, lang)}`],
    ...(bookingEnd(b, lang) ? ([[b.hours || !b.toLocationId ? t.checkout.endsAt : t.checkout.arrivesAround, bookingEnd(b, lang)!]] as [string, string][]) : []),
    [t.checkout.pickup, b.pickupAddress],
    [
      t.checkout.customer,
      <span key="c">
        {b.customerName} · <bdo dir="ltr" className="inline-block">{maskPhone(b.customerPhone)}</bdo>
      </span>,
    ],
    [t.form.passengers, `${formatNumber(b.passengers, lang)} · ${t.form.bags}: ${formatNumber(b.bags, lang)}`],
  ];
  return (
    <div className="bg-paper border border-line rounded-xl">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-line">
        <p>
          <span className="block text-xs text-muted">{t.checkout.ref}</span>
          <span className="font-display font-semibold text-xl tracking-wider" dir="ltr">
            {b.ref}
          </span>
        </p>
        <StatusBadge status={b.status} t={t} />
      </div>
      <dl className="divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[110px_1fr] sm:grid-cols-[140px_1fr] gap-3 px-5 py-3 text-[15px]">
            <dt className="text-muted">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="px-5 py-4 border-t border-line bg-stone/60 rounded-b-xl space-y-1.5 tabular">
        {b.vatAmount > 0 && (
          <>
            <div className="flex justify-between text-[15px]">
              <span className="text-muted">{t.form.subtotal}</span>
              <span>{formatSAR(b.subtotal, lang)}</span>
            </div>
            <div className="flex justify-between text-[15px]">
              <span className="text-muted">
                {t.form.vat} ({formatNumber(b.vatRate / 100, lang)}٪)
              </span>
              <span>{formatSAR(b.vatAmount, lang)}</span>
            </div>
          </>
        )}
        <div className="flex items-baseline justify-between pt-1">
          <span className="text-muted">{b.vatAmount > 0 ? t.checkout.totalInclVat : t.checkout.total}</span>
          <span className="font-display font-semibold text-2xl">{formatSAR(b.amount, lang)}</span>
        </div>
        {b.vatAmount > 0 && vatNumber && (
          <p className="text-xs text-muted pt-1">
            {t.footer.vat}: <span dir="ltr">{vatNumber}</span>
          </p>
        )}
      </div>
    </div>
  );
}
