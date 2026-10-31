import { after } from "next/server";
import { maybeSweep } from "@/lib/sweep";
import { Suspense } from "react";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireDriver } from "@/lib/auth";
import { bookingNo, formatDate, formatNumber, formatSAR, formatTime } from "@/lib/format";
import { driverMoney, driverPayoutList } from "@/lib/driver-money";
import { bookingEnd } from "@/lib/timespan";
import { driverCompleteTrip, driverStartTrip, saveMyBankAccount } from "../../driver-actions";
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
  const [money, payouts, mine, upcoming, finished] = await Promise.all([
    driverMoney([me.driverId]).then((m) => m.get(me.driverId)!),
    driverPayoutList(me.driverId, 20),
    db.query.drivers.findFirst({ where: eq(s.drivers.id, me.driverId), columns: { bankAccount: true } }),
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
      {/* what he earned, what he was paid, what is left */}
      <section aria-labelledby="money-title" className="space-y-3" data-testid="driver-money">
        <h2 id="money-title" className="text-lg font-semibold">
          مستحقاتي
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            ["المستحق لي", money.earned, "text-ink"],
            ["المدفوع لي", money.paid, "text-sign"],
            ["الباقي لي", money.remaining, money.remaining > 0 ? "text-amber-deep" : "text-ink"],
          ].map(([label, v, tone]) => (
            <Card key={label as string} className="p-4">
              <p className="text-xs text-muted">{label}</p>
              <p className={`mt-1 text-lg font-semibold tabular ${tone}`} data-money={label}>
                {formatSAR(v as number, "ar")}
              </p>
            </Card>
          ))}
        </div>
        <p className="text-xs text-muted">
          المستحق = أجرة رحلاتك المنتهية.{money.coming > 0 ? ` وعندك ${formatSAR(money.coming, "ar")} في رحلات قادمة تُضاف بعد انتهائها.` : ""}
        </p>
        {payouts.length > 0 && (
          <details className="rounded-lg border border-line bg-paper">
            <summary className="cursor-pointer px-4 py-3 text-sm text-sign">الدفعات التي استلمتها ({formatNumber(payouts.length, "ar")})</summary>
            <ul className="divide-y divide-line text-sm" data-testid="my-payouts">
              {payouts.map((p) => (
                <li key={p.id} className="px-4 py-2 flex flex-wrap justify-between gap-2">
                  <span>
                    {formatDate(p.paidOn, "ar")}
                    {p.note ? <span className="text-muted"> · {p.note}</span> : null}
                  </span>
                  <span className="font-medium tabular">{formatSAR(p.amount, "ar")}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <details className="rounded-lg border border-line bg-paper" data-testid="my-bank">
          <summary className="cursor-pointer px-4 py-3 text-sm text-sign">{mine?.bankAccount ? "حسابي البنكي" : "أضف حسابك البنكي لاستلام مستحقاتك"}</summary>
          <div className="px-4 pb-4">
            <ActionForm action={saveMyBankAccount} submitLabel="حفظ الحساب البنكي">
              <textarea name="bankAccount" rows={3} maxLength={300} defaultValue={mine?.bankAccount ?? ""} className="field" placeholder="اسم البنك، رقم الآيبان SA…، اسم صاحب الحساب" aria-label="الحساب البنكي" />
            </ActionForm>
          </div>
        </details>
      </section>

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
                    <p className="text-[15px]" data-testid="trip-fare">
                      <span className="text-muted">أجرتك: </span>
                      {b.driverFare != null ? <span className="font-semibold tabular">{formatSAR(b.driverFare, "ar")}</span> : <span className="text-muted">تحددها الإدارة</span>}
                    </p>
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
                  <span className="flex items-center gap-3">
                    {b.driverFare != null && <span className="font-medium tabular">{formatSAR(b.driverFare, "ar")}</span>}
                    {r ? <Stars value={r.driverStars} size="sm" /> : <span className="text-muted">لم يقيّم بعد</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
