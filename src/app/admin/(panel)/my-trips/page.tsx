import { after } from "next/server";
import { maybeSweep } from "@/lib/sweep";
import { Suspense } from "react";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireDriver } from "@/lib/auth";
import { bookingNo, formatDate, formatNumber, formatTime } from "@/lib/format";
import { bookingEnd } from "@/lib/timespan";
import { driverCompleteTrip, driverStartTrip } from "../../driver-actions";
import { ActionForm } from "@/components/admin/action-form";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { Card, PageHeader, Skeleton } from "@/components/admin/ui";
import { Stars } from "@/components/site/stars";
import { waLink } from "@/components/site/whatsapp-fab";
import { PhoneIcon, WhatsAppIcon } from "@/components/icons";

const formatClock = (d: Date) => new Intl.DateTimeFormat("ar-SA", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(d);

export default function MyTripsPage({ searchParams }: PageProps<"/admin/my-trips">) {
  return (
    <>
      <PageHeader title="رحلاتي" />
      <Suspense fallback={<Skeleton h="h-96" />}>
        <MyTrips searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function MyTrips({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireDriver();
  after(maybeSweep);
  const done = String((await searchParams).done ?? "");
  const [upcoming, finished] = await Promise.all([
    db
      .select()
      .from(s.bookings)
      .where(and(eq(s.bookings.driverId, me.driverId), eq(s.bookings.status, "confirmed")))
      .orderBy(asc(s.bookings.pickupDate), asc(s.bookings.pickupTime)),
    db
      .select({ b: s.bookings, r: s.ratings })
      .from(s.bookings)
      .leftJoin(s.ratings, eq(s.ratings.bookingId, s.bookings.id))
      .where(and(eq(s.bookings.driverId, me.driverId), inArray(s.bookings.status, ["completed"])))
      .orderBy(desc(s.bookings.completedAt))
      .limit(20),
  ]);

  return (
    <div className="space-y-8 max-w-3xl">
      <AutoRefresh every={60_000} />
      {/^[A-Z0-9]{8}$/.test(done) && (
        <p role="status" className="rounded-lg bg-sign-soft border border-sign/20 px-4 py-3 text-sign">
          انتهت الرحلة {bookingNo(finished.find(({ b }) => b.ref === done)?.b.number)}. شكرًا لك! طلبنا من العميل تقييم الرحلة.
        </p>
      )}
      <section>
        <h2 className="text-lg font-semibold mb-3">الرحلات القادمة ({formatNumber(upcoming.length, "ar")})</h2>
        {upcoming.length === 0 ? (
          <p className="text-muted">لا توجد رحلات مسندة لك الآن.</p>
        ) : (
          <ul className="space-y-4" data-testid="my-trips">
            {upcoming.map((b) => {
              const end = bookingEnd(b, "ar");
              const hello = `مرحبًا ${b.customerName}، معك ${me.name} سائق رحلتك رقم ${b.ref}.`;
              return (
                <li key={b.id}>
                  <Card className="p-5 space-y-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold text-[17px]">
                        {formatDate(b.pickupDate, "ar")}، {formatTime(b.pickupTime, "ar")}
                      </p>
                      <p className="text-sm text-muted" dir="ltr">
                        {bookingNo(b.number)}
                      </p>
                    </div>
                    <p>{b.routeTitle}</p>
                    <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-[15px]">
                      <dt className="text-muted">الاستلام</dt>
                      <dd>{b.pickupAddress}</dd>
                      {b.dropoffAddress && (
                        <>
                          <dt className="text-muted">النزول</dt>
                          <dd>{b.dropoffAddress}</dd>
                        </>
                      )}
                      {end && (
                        <>
                          <dt className="text-muted">{b.hours ? "ينتهي الحجز" : "الوصول المتوقع"}</dt>
                          <dd>{end}</dd>
                        </>
                      )}
                      <dt className="text-muted">العميل</dt>
                      <dd>{b.customerName}</dd>
                      <dt className="text-muted">الجوال</dt>
                      <dd dir="ltr" style={{ textAlign: "right" }}>
                        {b.customerPhone}
                      </dd>
                      <dt className="text-muted">الركاب</dt>
                      <dd>
                        {formatNumber(b.passengers, "ar")} راكب، {formatNumber(b.bags, "ar")} حقيبة
                      </dd>
                      {b.flightNumber && (
                        <>
                          <dt className="text-muted">رحلة الطيران</dt>
                          <dd dir="ltr" style={{ textAlign: "right" }}>
                            {b.flightNumber}
                          </dd>
                        </>
                      )}
                      {b.notes && (
                        <>
                          <dt className="text-muted">ملاحظات</dt>
                          <dd className="whitespace-pre-line">{b.notes}</dd>
                        </>
                      )}
                    </dl>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <a href={waLink(b.customerPhone, hello)} target="_blank" rel="noopener noreferrer" className="btn btn-primary !min-h-10">
                        <WhatsAppIcon className="size-4" /> واتساب العميل
                      </a>
                      <a href={`tel:${b.customerPhone}`} className="btn btn-ghost !min-h-10">
                        <PhoneIcon className="size-4" /> اتصال
                      </a>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
                      {b.startedAt ? (
                        <p className="text-sm text-sign">بدأت الرحلة الساعة {formatClock(b.startedAt)}</p>
                      ) : (
                        <ActionForm action={driverStartTrip} submitLabel="بدأت الرحلة" submitClassName="btn btn-ghost !min-h-10" className="">
                          <input type="hidden" name="bookingId" value={b.id} />
                        </ActionForm>
                      )}
                      <ActionForm action={driverCompleteTrip} submitLabel="انتهت الرحلة" submitClassName="btn btn-primary !min-h-10" className="">
                        <input type="hidden" name="bookingId" value={b.id} />
                      </ActionForm>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">آخر الرحلات المنتهية</h2>
        {finished.length === 0 ? (
          <p className="text-muted">لا توجد رحلات منتهية بعد.</p>
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {finished.map(({ b, r }) => (
                <li key={b.id} className="px-5 py-3 text-sm flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block font-medium">{formatDate(b.pickupDate, "ar")}</span>
                    <bdi className="text-muted">{b.routeTitle}</bdi>
                  </span>
                  {r ? <Stars value={r.driverStars} size="sm" /> : <span className="text-muted">لم يقيّم بعد</span>}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
