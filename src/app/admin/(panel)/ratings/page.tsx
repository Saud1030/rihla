import Link from "next/link";
import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { getSettings } from "@/lib/catalog";
import { driverRatings, getRatingSummary, listRatings } from "@/lib/ratings";
import { formatDate, formatNumber } from "@/lib/format";
import { saveReviewsDisplay, toggleRating } from "../../rating-actions";
import { ActionForm } from "@/components/admin/action-form";
import { Card, PageHeader, Skeleton } from "@/components/admin/ui";
import { Stars } from "@/components/site/stars";

export default function RatingsPage({ searchParams }: PageProps<"/admin/ratings">) {
  return (
    <>
      <PageHeader title="التقييمات" />
      <Suspense fallback={<Skeleton h="h-96" />}>
        <Ratings searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Ratings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection("ratings");
  const driverId = Number((await searchParams).driver ?? 0) || undefined;
  const [sum, byDriver, drivers, rows, st] = await Promise.all([
    getRatingSummary(),
    driverRatings(),
    db.select({ id: s.drivers.id, name: s.drivers.name }).from(s.drivers).orderBy(asc(s.drivers.name)),
    listRatings({ driverId, limit: 100 }),
    getSettings(),
  ]);
  const ranked = drivers.filter((d) => byDriver.has(d.id)).sort((a, b) => byDriver.get(b.id)!.avg - byDriver.get(a.id)!.avg);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted">تقييم الشركة</p>
          <p className="mt-1 flex items-center gap-2">
            <span className="font-display text-2xl font-semibold tabular">{sum.count ? formatNumber(sum.company, "ar", 1) : "—"}</span>
            {sum.count > 0 && <Stars value={sum.company} size="sm" />}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">متوسط تقييم السائقين</p>
          <p className="mt-1 flex items-center gap-2">
            <span className="font-display text-2xl font-semibold tabular">{sum.count ? formatNumber(sum.driver, "ar", 1) : "—"}</span>
            {sum.count > 0 && <Stars value={sum.driver} size="sm" />}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">عدد التقييمات</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular">{formatNumber(sum.count, "ar")}</p>
        </Card>
      </div>

      {ranked.length > 0 && (
        <Card>
          <h2 className="font-semibold px-5 py-3 border-b border-line">ترتيب السائقين</h2>
          <ul className="divide-y divide-line">
            {ranked.map((d) => {
              const r = byDriver.get(d.id)!;
              return (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                  <Link href={`/admin/ratings?driver=${d.id}`} className={`hover:text-sign ${driverId === d.id ? "font-semibold text-sign" : ""}`}>
                    {d.name}
                  </Link>
                  <span className="flex items-center gap-2">
                    <Stars value={r.avg} size="sm" /> {formatNumber(r.avg, "ar", 1)} من ٥، {formatNumber(r.count, "ar")} تقييم
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="font-semibold mb-4">العرض في الموقع («آراء عملائنا»)</h2>
        <ActionForm action={saveReviewsDisplay} submitLabel="حفظ">
          <label className="flex items-start gap-3">
            <input type="checkbox" name="reviews_enabled" defaultChecked={st.reviews_enabled !== "0"} className="size-4 mt-1 accent-sign" />
            <span>
              <span className="block font-medium">إظهار قسم آراء العملاء في الصفحة الرئيسية</span>
              <span className="block text-sm text-muted">يعرض متوسط التقييم من كل التقييمات، وأحدث التعليقات مع الاسم الأول للعميل فقط.</span>
            </span>
          </label>
          <label className="block max-w-xs">
            <span className="block text-sm font-medium mb-1">أقل تقييم يُعرض تعليقه</span>
            <select name="reviews_min_stars" defaultValue={st.reviews_min_stars || "1"} className="field">
              <option value="1">كل التعليقات</option>
              <option value="3">٣ نجوم فأكثر</option>
              <option value="4">٤ نجوم فأكثر</option>
              <option value="5">٥ نجوم فقط</option>
            </select>
          </label>
        </ActionForm>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-line">
          <h2 className="font-semibold">{driverId ? `تقييمات ${drivers.find((d) => d.id === driverId)?.name ?? ""}` : "كل التقييمات"}</h2>
          {driverId && (
            <Link href="/admin/ratings" className="text-sm text-sign hover:underline">
              عرض الكل
            </Link>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">لا توجد تقييمات بعد. يُرسل طلب التقييم للعميل على واتساب بعد انتهاء الرحلة.</p>
        ) : (
          <ul className="divide-y divide-line" data-testid="rating-list">
            {rows.map((r) => (
              <li key={r.id} className="px-5 py-4 text-sm space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {r.customerName} ·{" "}
                    <Link href={`/admin/bookings/${r.ref}`} className="text-sign hover:underline" dir="ltr">
                      {r.ref}
                    </Link>
                  </p>
                  <p className="text-muted">{formatDate(r.createdAt.toISOString().slice(0, 10), "ar")}</p>
                </div>
                <p className="flex flex-wrap gap-x-5 gap-y-1">
                  <span className="flex items-center gap-1.5">
                    الشركة <Stars value={r.companyStars} size="sm" />
                  </span>
                  <span className="flex items-center gap-1.5">
                    السائق{r.driverName ? ` (${r.driverName})` : ""} <Stars value={r.driverStars} size="sm" />
                  </span>
                </p>
                {r.comment && <p className="bg-stone rounded-md px-3 py-2 whitespace-pre-line">{r.comment}</p>}
                <div className="flex items-center gap-3">
                  <span className={r.visible ? "text-sign" : "text-muted"}>{r.visible ? "يظهر في الموقع" : "مخفي من الموقع"}</span>
                  <ActionForm action={toggleRating} submitLabel={r.visible ? "إخفاء من الموقع" : "إظهار في الموقع"} submitClassName="btn btn-ghost !min-h-8 !py-0.5 text-sm" className="">
                    <input type="hidden" name="id" value={r.id} />
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
