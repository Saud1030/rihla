import Link from "next/link";
import { Suspense } from "react";
import { requireSection } from "@/lib/auth";
import { todayInRiyadh } from "@/lib/booking";
import { listBookings, parseBookingFilters } from "@/lib/admin-data";
import { formatDate, formatNumber, formatSAR } from "@/lib/format";
import { PageHeader, Skeleton } from "@/components/admin/ui";
import type { AmountsView } from "@/components/admin/bookings-table";

export default function RevenuePage({ searchParams }: PageProps<"/admin/revenue">) {
  return (
    <>
      <PageHeader title="الإيرادات" />
      <Suspense fallback={<Skeleton h="h-96" />}>
        <Revenue searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Revenue({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection("revenue");
  const sp = await searchParams;
  // the period, plus any bookings-list filters carried over from the bookings page link
  const filters = parseBookingFilters(sp);
  const amounts: AmountsView = sp.amounts === "net" || sp.amounts === "gross" ? sp.amounts : "both";
  const { revenue, daily } = await listBookings(filters);
  const kept = {
    status: filters.status,
    q: filters.q,
    from: filters.from,
    to: filters.to,
    timeFrom: filters.timeFrom,
    timeTo: filters.timeTo,
    customer: filters.customer,
    phone: filters.phone,
    city: filters.city,
    place: filters.place,
    driver: filters.driver,
    vehicle: filters.vehicle,
    amounts: amounts === "both" ? undefined : amounts,
  };
  const narrowed = Object.entries(kept).some(([k, v]) => v && !["from", "to", "amounts"].includes(k));
  const qs = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...kept, ...patch })) if (v) p.set(k, String(v));
    const str = p.toString();
    return `/admin/revenue${str ? `?${str}` : ""}`;
  };
  const today = todayInRiyadh();
  const monthStart = `${today.slice(0, 8)}01`;

  return (
    <div className="space-y-4 max-w-6xl">
      {/* revenue of the bookings that match the filters (paid ones), before and after VAT */}
      <section className="rounded-xl border border-line bg-paper p-4 space-y-3" data-testid="bookings-revenue" aria-label="الإيرادات">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">
              الإيرادات{" "}
              {filters.from || filters.to ? (
                <span className="font-normal text-muted text-sm" data-testid="revenue-range">
                  {filters.from && filters.from === filters.to
                    ? `يوم ${formatDate(filters.from, "ar")}`
                    : `${filters.from ? `من ${formatDate(filters.from, "ar", { weekday: false })}` : ""} ${filters.to ? `إلى ${formatDate(filters.to, "ar", { weekday: false })}` : ""}`}
                </span>
              ) : (
                <span className="font-normal text-muted text-sm">كل التواريخ</span>
              )}
            </h2>
            <p className="text-xs text-muted">
              للحجوزات المدفوعة، حسب تاريخ الرحلة
              {narrowed && (
                <>
                  {" "}
                  وفلاتر الحجوزات ·{" "}
                  <Link href={`/admin/revenue${filters.from || filters.to ? `?${new URLSearchParams(Object.entries({ from: filters.from, to: filters.to }).filter(([, v]) => v) as [string, string][])}` : ""}`} className="text-sign hover:underline">
                    كل الحجوزات
                  </Link>
                </>
              )}
              .
            </p>
          </div>
          <nav className="flex flex-wrap gap-1.5" aria-label="عرض المبالغ">
            {(
              [
                ["both", "قبل وبعد الضريبة"],
                ["net", "قبل الضريبة"],
                ["gross", "بعد الضريبة"],
              ] as const
            ).map(([v, label]) => (
              <Link
                key={v}
                href={qs({ amounts: v === "both" ? undefined : v })}
                aria-current={amounts === v ? "page" : undefined}
                className={`rounded-full px-3 py-1 text-sm border ${amounts === v ? "bg-ink text-white border-ink" : "bg-paper border-line hover:border-sign"}`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        {/* pick a period: from one date to another */}
        <form method="get" className="flex flex-wrap items-end gap-2" data-testid="revenue-range-form">
          {Object.entries(kept)
            .filter(([k, v]) => v && k !== "from" && k !== "to")
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={String(v)} />
            ))}
          <label className="block">
            <span className="block text-xs text-muted mb-1">من تاريخ</span>
            <input type="date" name="from" defaultValue={filters.from} className="field !min-h-9 !py-1" />
          </label>
          <label className="block">
            <span className="block text-xs text-muted mb-1">إلى تاريخ</span>
            <input type="date" name="to" defaultValue={filters.to} className="field !min-h-9 !py-1" />
          </label>
          <button className="btn btn-primary !min-h-9 !py-1 text-sm">عرض الإيرادات</button>
          <Link href={qs({ from: today, to: today, page: undefined })} className="btn btn-ghost border border-line !min-h-9 !py-1 text-sm">
            اليوم
          </Link>
          <Link href={qs({ from: monthStart, to: today, page: undefined })} className="btn btn-ghost border border-line !min-h-9 !py-1 text-sm">
            هذا الشهر
          </Link>
          {(filters.from || filters.to) && (
            <Link href={qs({ from: undefined, to: undefined, page: undefined })} className="btn btn-ghost border border-line !min-h-9 !py-1 text-sm">
              كل التواريخ
            </Link>
          )}
        </form>
        <dl className="grid gap-3 grid-cols-2 md:grid-cols-5 text-sm">
          {(
            [
              ["حجوزات مدفوعة", formatNumber(revenue.count, "ar"), "count", true],
              ["قبل الضريبة", formatSAR(revenue.subtotal, "ar"), "net", amounts !== "gross"],
              ["الضريبة", formatSAR(revenue.vat, "ar"), "vat", amounts === "both"],
              ["بعد الضريبة", formatSAR(revenue.amount, "ar"), "gross", amounts !== "net"],
              ["أجور السائقين", formatSAR(revenue.driverFares, "ar"), "fares", true],
            ] as const
          )
            .filter((x) => x[3])
            .map(([k, v, id]) => (
              <div key={id} className="rounded-lg bg-stone px-3 py-2" data-revenue={id}>
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="font-semibold tabular text-[15px]">{v}</dd>
              </div>
            ))}
        </dl>

        {/* the same revenue day by day, 7 days a page; a date shows only that day */}
        <div className="border-t border-line pt-3 space-y-2" data-testid="daily-revenue">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium text-sm">الإيرادات اليومية</h3>
            {daily.pages > 1 && (
              <nav className="flex items-center gap-2 text-sm" aria-label="صفحات الأيام" data-testid="daily-pager">
                {daily.page < daily.pages ? (
                  <Link href={qs({ dpage: daily.page + 1, page: undefined })} className="btn btn-ghost border border-line !min-h-8 !py-0.5 text-sm">
                    أيام أقدم
                  </Link>
                ) : null}
                <span className="text-muted tabular">
                  {formatNumber(daily.page, "ar")} / {formatNumber(daily.pages, "ar")}
                </span>
                {daily.page > 1 ? (
                  <Link href={qs({ dpage: daily.page > 2 ? daily.page - 1 : undefined, page: undefined })} className="btn btn-ghost border border-line !min-h-8 !py-0.5 text-sm">
                    أيام أحدث
                  </Link>
                ) : null}
              </nav>
            )}
          </div>
          {daily.rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular">
                <thead className="text-muted text-xs">
                  <tr className="border-b border-line">
                    <th className="text-start font-medium py-2 px-2">اليوم</th>
                    <th className="text-start font-medium py-2 px-2">الحجوزات</th>
                    {amounts !== "gross" && <th className="text-start font-medium py-2 px-2">قبل الضريبة</th>}
                    {amounts === "both" && <th className="text-start font-medium py-2 px-2">الضريبة</th>}
                    {amounts !== "net" && <th className="text-start font-medium py-2 px-2">بعد الضريبة</th>}
                    <th className="text-start font-medium py-2 px-2">أجور السائقين</th>
                    <th className="text-start font-medium py-2 px-2">الصافي بعد أجور السائقين</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.rows.map((d) => (
                    <tr key={d.day} className="border-b border-line last:border-0" data-day={d.day}>
                      <td className="py-2 px-2">
                        <Link href={qs({ from: d.day, to: d.day, page: undefined })} className="text-sign hover:underline">
                          {formatDate(d.day, "ar")}
                        </Link>
                      </td>
                      <td className="py-2 px-2">{formatNumber(d.count, "ar")}</td>
                      {amounts !== "gross" && <td className="py-2 px-2">{formatSAR(d.subtotal, "ar")}</td>}
                      {amounts === "both" && <td className="py-2 px-2">{formatSAR(d.vat, "ar")}</td>}
                      {amounts !== "net" && <td className="py-2 px-2 font-medium">{formatSAR(d.amount, "ar")}</td>}
                      <td className="py-2 px-2">{formatSAR(d.driverFares, "ar")}</td>
                      <td className="py-2 px-2">{formatSAR(d.subtotal - d.driverFares, "ar")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">لا توجد إيرادات في هذه الفترة.</p>
          )}
        </div>
      </section>

    </div>
  );
}
