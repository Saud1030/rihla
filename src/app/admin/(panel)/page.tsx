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
import { formatNumber, formatSAR } from "@/lib/format";
import { Card, PageHeader, Skeleton } from "@/components/admin/ui";
import { BookingsTable } from "@/components/admin/bookings-table";

export default function DashboardPage({ searchParams }: PageProps<"/admin">) {
  return (
    <>
      <PageHeader title="الرئيسية" />
      <Suspense fallback={<Skeleton h="h-96" />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </>
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

  const stats = [
    { label: "بحاجة لتأكيد السائق", value: formatNumber(d.toConfirm, "ar"), href: "/admin/bookings?status=paid", strong: d.toConfirm > 0 },
    { label: "رحلات اليوم", value: formatNumber(d.todayPickups, "ar") },
    { label: "إيراد هذا الشهر (شامل الضريبة)", value: formatSAR(d.monthRevenue, "ar"), sub: `${formatNumber(d.monthPaidCount, "ar")} حجز مدفوع` },
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
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {stats.map((s) => {
          const body = (
            <>
              <p className="text-sm text-muted">{s.label}</p>
              <p className={`mt-1 font-display text-2xl font-semibold tabular ${s.strong ? "text-amber-deep" : ""}`}>{s.value}</p>
              {s.sub && <p className="text-xs text-muted mt-0.5">{s.sub}</p>}
            </>
          );
          return s.href ? (
            <Link key={s.label} href={s.href} className={`block bg-paper border rounded-xl p-4 hover:border-sign ${s.strong ? "border-amber border-2" : "border-line"}`}>
              {body}
            </Link>
          ) : (
            <Card key={s.label} className="p-4">
              {body}
            </Card>
          );
        })}
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">الرحلات القادمة (٧ أيام)</h2>
        <Card>
          <BookingsTable rows={d.upcoming} empty="لا توجد رحلات مدفوعة خلال الأيام السبعة القادمة." />
        </Card>
      </section>
    </div>
  );
}
