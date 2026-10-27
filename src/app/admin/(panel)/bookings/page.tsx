import Link from "next/link";
import { Suspense } from "react";
import { requireSection } from "@/lib/auth";
import { bookingCountsByStatus, listBookings, type BookingFilters } from "@/lib/admin-data";
import { schema as s } from "@/db";
import { getDictionary } from "@/i18n/dictionaries";
import { formatNumber } from "@/lib/format";
import { Card, PageHeader, Pager, Skeleton } from "@/components/admin/ui";
import { BookingsTable } from "@/components/admin/bookings-table";

const t = getDictionary("ar");
const STATUSES = s.bookingStatus.enumValues;

export default function BookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  return (
    <>
      <PageHeader title="الحجوزات" />
      <Suspense fallback={<Skeleton h="h-96" />}>
        <Bookings searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Bookings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection("bookings");
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

  const filters: BookingFilters = {
    status: STATUSES.find((x) => x === one("status")),
    q: one("q").slice(0, 60) || undefined,
    from: date(one("from")),
    to: date(one("to")),
    page: Number(one("page")) || 1,
  };
  const [{ rows, total, page, pages }, counts] = await Promise.all([listBookings(filters), bookingCountsByStatus()]);

  const qs = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { status: filters.status, q: filters.q, from: filters.from, to: filters.to, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    const str = p.toString();
    return `/admin/bookings${str ? `?${str}` : ""}`;
  };

  return (
    <div className="space-y-4">
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
            {t.booking.status[st]} <span className="tabular opacity-70">{formatNumber(counts[st] ?? 0, "ar")}</span>
          </Link>
        ))}
      </nav>

      <form method="get" className="flex flex-wrap items-end gap-3">
        {filters.status && <input type="hidden" name="status" value={filters.status} />}
        <label className="block grow min-w-52">
          <span className="block text-sm font-medium mb-1">بحث</span>
          <input name="q" defaultValue={filters.q} placeholder="رقم الحجز، الاسم أو الجوال" className="field" />
        </label>
        <label className="block">
          <span className="block text-sm font-medium mb-1">الاستلام من</span>
          <input type="date" name="from" defaultValue={filters.from} className="field" />
        </label>
        <label className="block">
          <span className="block text-sm font-medium mb-1">إلى</span>
          <input type="date" name="to" defaultValue={filters.to} className="field" />
        </label>
        <button className="btn btn-primary">بحث</button>
        {(filters.q || filters.from || filters.to) && (
          <Link href={qs({ q: undefined, from: undefined, to: undefined, page: undefined })} className="btn btn-ghost">
            مسح
          </Link>
        )}
      </form>

      <p className="text-sm text-muted tabular">{formatNumber(total, "ar")} حجز</p>
      <Card>
        <BookingsTable rows={rows} />
      </Card>
      <Pager page={page} pages={pages} href={(p) => qs({ page: p })} />
    </div>
  );
}
