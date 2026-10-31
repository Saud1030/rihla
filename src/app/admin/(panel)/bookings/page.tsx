import Link from "next/link";
import { Suspense } from "react";
import { requireSection } from "@/lib/auth";
import {
  bookingCountsByStatus,
  listBookings,
  parseBookingFilters,
  type BookingFilters,
} from "@/lib/admin-data";
import { asc } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { LocationOptions } from "@/components/admin/route-fields";
import { getDictionary } from "@/i18n/dictionaries";
import { formatNumber } from "@/lib/format";
import { Card, PageHeader, Pager, Skeleton } from "@/components/admin/ui";
import { BookingsTable } from "@/components/admin/bookings-table";

const t = getDictionary("ar");
const STATUSES = s.bookingStatus.enumValues;

export default function BookingsPage({
  searchParams,
}: PageProps<"/admin/bookings">) {
  return (
    <>
      <PageHeader title="الحجوزات" />
      <Suspense fallback={<Skeleton h="h-96" />}>
        <Bookings searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Bookings({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSection("bookings");
  const sp = await searchParams;
  const filters: BookingFilters = parseBookingFilters(sp);
  const [
    { rows, total, page, pages },
    counts,
    cities,
    locations,
    drivers,
    vehicles,
  ] = await Promise.all([
    listBookings(filters),
    bookingCountsByStatus(),
    db
      .select()
      .from(s.cities)
      .orderBy(asc(s.cities.sortOrder), asc(s.cities.id)),
    db
      .select()
      .from(s.locations)
      .orderBy(asc(s.locations.sortOrder), asc(s.locations.id)),
    db
      .select({ id: s.drivers.id, name: s.drivers.name })
      .from(s.drivers)
      .orderBy(asc(s.drivers.name)),
    db
      .select({ id: s.vehicles.id, name: s.vehicles.nameAr })
      .from(s.vehicles)
      .orderBy(asc(s.vehicles.sortOrder)),
  ]);

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
  };
  const qs = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...kept, ...patch }))
      if (v) p.set(k, String(v));
    const str = p.toString();
    return `/admin/bookings${str ? `?${str}` : ""}`;
  };
  const active = Object.entries(kept).some(([k, v]) => k !== "status" && v);
  // the same filters, for the PDF / Excel download
  const exportHref = (format: "pdf" | "xlsx") => {
    const p = new URLSearchParams({ format });
    for (const [k, v] of Object.entries(kept)) if (v) p.set(k, String(v));
    return `/api/admin/bookings/export?${p}`;
  };
  const label = "block text-sm font-medium mb-1";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2" data-testid="bookings-export">
        <span className="text-sm text-muted">تحميل القائمة{active || filters.status ? " (حسب الفلاتر)" : ""}:</span>
        <a href={exportHref("xlsx")} className="btn btn-ghost border border-line !min-h-9 !py-1 text-sm" download>
          Excel
        </a>
        <a href={exportHref("pdf")} className="btn btn-ghost border border-line !min-h-9 !py-1 text-sm" download>
          PDF
        </a>
      </div>

      {/* Status tabs */}
      <nav className="flex flex-wrap gap-1.5" aria-label="تصفية حسب الحالة">
        <Link
          href={qs({ status: undefined, page: undefined })}
          className={`rounded-full px-3 py-1 text-sm border ${!filters.status ? "bg-ink text-white border-ink" : "bg-paper border-line"}`}
        >
          الكل
        </Link>
        {STATUSES.map((st) => (
          <Link
            key={st}
            href={qs({ status: st, page: undefined })}
            className={`rounded-full px-3 py-1 text-sm border ${filters.status === st ? "bg-ink text-white border-ink" : "bg-paper border-line"}`}
          >
            {t.booking.status[st]}{" "}
            <span className="tabular opacity-70">
              {formatNumber(counts[st] ?? 0, "ar")}
            </span>
          </Link>
        ))}
      </nav>

      <form
        method="get"
        className="rounded-xl border border-line bg-paper p-4 space-y-3"
        data-testid="booking-filters"
      >
        {filters.status && (
          <input type="hidden" name="status" value={filters.status} />
        )}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-6">
          <label className="block col-span-2">
            <span className={label}>رقم الحجز أو بحث عام</span>
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="MHT05، اسم، جوال"
              className="field"
            />
          </label>
          <label className="block">
            <span className={label}>التاريخ من</span>
            <input
              type="date"
              name="from"
              defaultValue={filters.from}
              className="field"
            />
          </label>
          <label className="block">
            <span className={label}>التاريخ إلى</span>
            <input
              type="date"
              name="to"
              defaultValue={filters.to}
              className="field"
            />
          </label>
          <label className="block">
            <span className={label}>الوقت من</span>
            <input
              type="time"
              name="timeFrom"
              defaultValue={filters.timeFrom}
              className="field"
            />
          </label>
          <label className="block">
            <span className={label}>الوقت إلى</span>
            <input
              type="time"
              name="timeTo"
              defaultValue={filters.timeTo}
              className="field"
            />
          </label>
          <label className="block">
            <span className={label}>العميل</span>
            <input
              name="customer"
              defaultValue={filters.customer}
              placeholder="الاسم"
              className="field"
            />
          </label>
          <label className="block">
            <span className={label}>جوال العميل</span>
            <input
              name="phone"
              defaultValue={filters.phone}
              placeholder="05..."
              inputMode="tel"
              dir="ltr"
              className="field text-start"
            />
          </label>
          <label className="block">
            <span className={label}>المدينة</span>
            <select
              name="city"
              defaultValue={filters.city ?? ""}
              className="field"
            >
              <option value="">كل المدن</option>
              {cities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.nameAr}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={label}>الوجهة</span>
            <select
              name="place"
              defaultValue={filters.place ?? ""}
              className="field"
            >
              <option value="">كل الوجهات</option>
              <LocationOptions locations={locations} cities={cities} />
            </select>
          </label>
          <label className="block">
            <span className={label}>السائق</span>
            <select
              name="driver"
              defaultValue={filters.driver ?? ""}
              className="field"
            >
              <option value="">كل السائقين</option>
              <option value="none">بدون سائق</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={label}>السيارة</span>
            <select
              name="vehicle"
              defaultValue={filters.vehicle ?? ""}
              className="field"
            >
              <option value="">كل السيارات</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="btn btn-primary">بحث</button>
          {active && (
            <Link
              href={
                filters.status
                  ? `/admin/bookings?status=${filters.status}`
                  : "/admin/bookings"
              }
              className="btn btn-ghost"
            >
              مسح الفلاتر
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-muted tabular">
        {formatNumber(total, "ar")} حجز
      </p>
      <Card>
        <BookingsTable rows={rows} />
      </Card>
      <Pager page={page} pages={pages} href={(p) => qs({ page: p })} />
    </div>
  );
}
