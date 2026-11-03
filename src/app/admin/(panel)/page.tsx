import { after } from "next/server";
import { maybeSweep } from "@/lib/sweep";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { can, PATH_SECTIONS } from "@/lib/permissions";
import { LINKS } from "@/lib/admin-links";
import { getRatingSummary } from "@/lib/ratings";
import { chatCounts, getDashboardStats } from "@/lib/admin-data";
import { bookingNo, formatDateTime, formatNumber, formatSAR } from "@/lib/format";
import { todayInRiyadh } from "@/lib/booking";
import { getDictionary } from "@/i18n/dictionaries";
import { Card, PageHeader, Skeleton } from "@/components/admin/ui";
import { RevenueBars, StatusDonut } from "@/components/admin/charts";

const t = getDictionary("ar");

export default function DashboardPage({ searchParams }: PageProps<"/admin">) {
  return (
    <>
      <Suspense fallback={<PageHeader title="الرئيسية" />}>
        <Greeting />
      </Suspense>
      <Suspense fallback={<Skeleton h="h-96" />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </>
  );
}

/** "Hello, name" and what the page shows */
async function Greeting() {
  const me = await requireAdmin();
  const month = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-arab", { month: "long", year: "numeric", timeZone: "Asia/Riyadh" }).format(new Date());
  return (
    <div className="mb-6">
      <h1 className="text-2xl md:text-3xl font-semibold">أهلًا، {me.name}</h1>
      <p className="text-muted mt-1">هذا ملخص أعمالك لشهر {month}.</p>
    </div>
  );
}

async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireAdmin();
  after(maybeSweep);
  if (me.role === "driver") redirect("/admin/my-trips");
  const denied = (await searchParams).denied ? (
    <p role="alert" className="mb-6 rounded-lg bg-danger-soft px-4 py-3 text-danger">ليست لديك صلاحية لهذا القسم. اطلب من المدير إضافتها لحسابك.</p>
  ) : null;
  if (!can(me, "bookings")) {
    const mine = LINKS.filter((l) => l.href !== "/admin" && PATH_SECTIONS.some(([p, sec]) => l.href.startsWith(p) && can(me, sec)));
    return (
      <div className="max-w-xl">
        {denied}
        <Card className="p-6">
          <p className="font-medium">مرحبًا {me.name}</p>
          <p className="text-sm text-muted mt-1 mb-4">الأقسام المتاحة لحسابك:</p>
          <ul className="grid gap-2">
            {mine.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-sign hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    );
  }
  const [d, chats, rating, [applications]] = await Promise.all([
    getDashboardStats(),
    chatCounts(),
    getRatingSummary(),
    db.select({ n: sql<number>`count(*)::int` }).from(s.drivers).where(eq(s.drivers.status, "pending")),
  ]);

  const today = todayInRiyadh();
  const stats = [
    { label: "بحاجة لتأكيد السائق", value: formatNumber(d.toConfirm, "ar"), href: "/admin/bookings?status=paid", strong: d.toConfirm > 0 },
    {
      label: "رحلات اليوم",
      value: formatNumber(d.today.total, "ar"),
      sub: `مؤكد ${formatNumber(d.today.confirmed + d.today.paid, "ar")} · مكتمل ${formatNumber(d.today.completed, "ar")} · ملغي ${formatNumber(d.today.cancelled, "ar")}`,
      href: `/admin/bookings?from=${today}&to=${today}`,
      id: "today",
    },
    {
      label: "إيراد هذا الشهر (شامل الضريبة)",
      value: formatSAR(d.monthRevenue, "ar"),
      sub: `${formatNumber(d.monthPaidCount, "ar")} حجز مدفوع`,
      href: "#payments",
      id: "revenue",
      change: d.lastMonthRevenue > 0 ? Math.round(((d.monthRevenue - d.lastMonthRevenue) / d.lastMonthRevenue) * 100) : null,
    },
    {
      label: "عدد السائقين",
      value: formatNumber(d.drivers.total, "ar"),
      sub: d.drivers.available === d.drivers.total ? "كلهم متاحون" : `${formatNumber(d.drivers.available, "ar")} متاح للرحلات`,
      href: "/admin/driver-team",
      id: "drivers",
    },
    { label: "حجوزات لم تُدفع", value: formatNumber(d.pendingPayment, "ar"), href: "/admin/bookings?status=pending_payment" },
    ...(d.transfersWaiting > 0
      ? [
          {
            label: "تحويلات بنكية بانتظار التأكيد",
            value: formatNumber(d.transfersWaiting, "ar"),
            sub: d.transfersWithReceipt ? `${formatNumber(d.transfersWithReceipt, "ar")} منها رفع العميل إيصالها` : "لم يُرفع إيصال بعد",
            href: "/admin/bookings?status=pending_payment",
            strong: true,
          },
        ]
      : []),
    ...(chats.needsReply > 0
      ? [{ label: "محادثات تنتظر ردك", value: formatNumber(chats.needsReply, "ar"), href: "/admin/chat", strong: true }]
      : []),
    ...(applications.n > 0
      ? [{ label: "طلبات انضمام سائقين", value: formatNumber(applications.n, "ar"), href: "/admin/drivers#applications", strong: true }]
      : []),
    ...(rating.count > 0
      ? [
          {
            label: "تقييم العملاء للشركة",
            value: `${formatNumber(rating.company, "ar", 1)} / ٥`,
            sub: `السائقين ${formatNumber(rating.driver, "ar", 1)} · ${formatNumber(rating.count, "ar")} تقييم`,
            href: "/admin/ratings",
          },
        ]
      : []),
    ...(d.refundsWaiting > 0
      ? [{ label: "استردادات بانتظار موافقتك", value: formatNumber(d.refundsWaiting, "ar"), href: "/admin/bookings?status=cancelled", strong: true }]
      : []),
  ];

  return (
    <div className="space-y-8">
      {denied}
      <div className="dash-in grid gap-3 grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {stats.map((s) => {
          const change = "change" in s ? s.change : null;
          const hero = "id" in s && s.id === "revenue";
          const body = (
            <>
              <p className={`text-sm ${hero ? "text-ink/80" : "text-muted"}`}>{s.label}</p>
              <p className={`mt-1 font-display text-2xl font-semibold tabular ${s.strong ? "text-amber-deep" : ""}`}>{s.value}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {s.sub && <p className={`text-xs ${hero ? "text-ink/75" : "text-muted"}`}>{s.sub}</p>}
                {change != null && (
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular ${change >= 0 ? "chg-up" : "chg-down"}`}
                    data-testid="revenue-change"
                  >
                    {change >= 0 ? "▲" : "▼"} {formatNumber(Math.abs(change), "ar")}٪ عن الشهر الماضي
                  </span>
                )}
              </div>
            </>
          );
          return s.href ? (
            <Link
              key={s.label}
              href={s.href}
              data-stat={"id" in s ? s.id : undefined}
              className={`lift block bg-paper border rounded-2xl p-4 hover:border-sign ${hero ? "stat-hero" : ""} ${s.strong ? "border-amber border-2" : "border-line"}`}
            >
              {body}
            </Link>
          ) : (
            <Card key={s.label} className="p-4">
              {body}
            </Card>
          );
        })}
      </div>

      {/* charts */}
      <div className="dash-in grid gap-3 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <RevenueBars data={d.revenueByDay} />
        </Card>
        <Card className="p-5">
          <StatusDonut counts={d.monthByStatus} labels={t.booking.status} />
        </Card>
      </div>

      <MonthPayments rows={d.monthPayments} />
    </div>
  );
}

/** Every payment received this month: when, from whom, how, and what was refunded later */
function MonthPayments({ rows }: { rows: Awaited<ReturnType<typeof getDashboardStats>>["monthPayments"] }) {
  const paid = rows.reduce((a, b) => a + b.amount, 0);
  const refunded = rows.reduce((a, b) => a + (b.refundStatus === "requested" || b.refundStatus === "manual" ? b.refundAmount : 0), 0);
  const th = "text-start font-medium px-3 py-3 whitespace-nowrap";
  const td = "px-3 py-2.5 whitespace-nowrap";
  return (
    <section id="payments" className="scroll-mt-4" data-testid="month-payments">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-lg font-semibold">مدفوعات هذا الشهر ({formatNumber(rows.length, "ar")})</h2>
        <p className="text-sm text-muted tabular">
          المدفوع {formatSAR(paid, "ar")}
          {refunded > 0 && ` · المسترد ${formatSAR(refunded, "ar")} · الصافي ${formatSAR(paid - refunded, "ar")}`}
        </p>
      </div>
      <Card>
        {rows.length === 0 ? (
          <p className="p-8 text-center text-muted">لا توجد مدفوعات هذا الشهر بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted">
                <tr className="border-b border-line">
                  <th className={th}>رقم الحجز</th>
                  <th className={th}>وقت الدفع</th>
                  <th className={th}>العميل</th>
                  <th className={th}>الرحلة</th>
                  <th className={th}>طريقة الدفع</th>
                  <th className={th}>قبل الضريبة</th>
                  <th className={th}>المبلغ</th>
                  <th className={th}>الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((b) => (
                  <tr key={b.id} className="hover:bg-stone/60">
                    <td className={td}>
                      <Link href={`/admin/bookings/${b.ref}`} className="font-display font-semibold text-sign hover:underline" dir="ltr">
                        {bookingNo(b.number)}
                      </Link>
                    </td>
                    <td className={`${td} tabular`}>{b.paidAt ? formatDateTime(b.paidAt, "ar") : "—"}</td>
                    <td className={td}>{b.customerName}</td>
                    <td className="px-3 py-2.5 min-w-48">
                      {b.fromName} ← {b.toName ?? "—"}
                    </td>
                    <td className={td}>{b.paymentMethod === "cash" ? "كاش" : b.paymentMethod === "bank_transfer" ? "تحويل بنكي" : "ماي فاتورة"}</td>
                    <td className={`${td} tabular`}>{formatSAR(b.subtotal, "ar")}</td>
                    <td className={`${td} tabular font-medium`}>{formatSAR(b.amount, "ar")}</td>
                    <td className={td}>
                      {b.status === "cancelled" ? <span className="text-danger">ملغي{b.refundAmount > 0 ? ` · مسترد ${formatSAR(b.refundAmount, "ar")}` : ""}</span> : t.booking.status[b.status]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}
