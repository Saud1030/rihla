import Link from "next/link";
import { Suspense } from "react";
import { asc, desc, inArray, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { driverRatings } from "@/lib/ratings";
import { formatDate, formatNumber, formatSAR } from "@/lib/format";
import { driverMoney, type DriverMoney } from "@/lib/driver-money";
import type { DriverPayout } from "@/db/schema";
import {
  addDriverPayout,
  deleteDriverPayout,
  approveDriver,
  blockDriver,
  deleteDriver,
  endSuspension,
  suspendDriver,
  unblockDriver,
  rejectDriver,
  removeDriverPhoto,
  saveDriver,
} from "../../driver-actions";
import { CARD_CM, CARD_DOCS, DOC_KINDS, DOC_LABELS, modelYears } from "@/lib/driver-docs";
import { ColorSelect, PlateFields } from "@/components/plate-fields";
import { PhotoField } from "@/components/site/photo-field";
import { formatDateTime } from "@/lib/format";
import { daysLabel, driverHold, SUSPEND_DAYS, upcomingTrips } from "@/lib/driver-hold";
import { todayInRiyadh } from "@/lib/booking";
import { ActionForm } from "@/components/admin/action-form";
import { Card, Field, PageHeader, Skeleton } from "@/components/admin/ui";
import { Stars } from "@/components/site/stars";
import { DriverPhoto } from "@/components/admin/driver-photo";
import { WhatsAppIcon } from "@/components/icons";
import { waLink } from "@/components/site/whatsapp-fab";

type Row = {
  id: number;
  name: string;
  phone: string;
  plateNumber: string;
  carType: string;
  carModel: string;
  carColor: string;
  notes: string;
  active: boolean;
  hasPhoto: boolean;
  updatedAt: Date;
  createdAt: Date;
  vehicleId: number | null;
  status: "pending" | "approved" | "rejected";
  rejectReason: string | null;
  bankAccount: string;
  blockedAt: Date | null;
  blockReason: string | null;
  suspendedUntil: Date | null;
  suspendReason: string | null;
};
type VehicleOption = { id: number; name: string };

export default function DriversPage({
  searchParams,
}: PageProps<"/admin/drivers">) {
  return (
    <>
      <PageHeader title="السائقين" />
      <Suspense fallback={<Skeleton h="h-96" />}>
        <Drivers searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Drivers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSection("drivers");
  const sp = await searchParams;
  const [rows, ratings, trips] = await Promise.all([
    db
      .select({
        id: s.drivers.id,
        name: s.drivers.name,
        phone: s.drivers.phone,
        plateNumber: s.drivers.plateNumber,
        carType: s.drivers.carType,
        carModel: s.drivers.carModel,
        carColor: s.drivers.carColor,
        notes: s.drivers.notes,
        active: s.drivers.active,
        hasPhoto: sql<boolean>`${s.drivers.photo} is not null`,
        updatedAt: s.drivers.updatedAt,
        createdAt: s.drivers.createdAt,
        vehicleId: s.drivers.vehicleId,
        status: s.drivers.status,
        rejectReason: s.drivers.rejectReason,
        bankAccount: s.drivers.bankAccount,
        blockedAt: s.drivers.blockedAt,
        blockReason: s.drivers.blockReason,
        suspendedUntil: s.drivers.suspendedUntil,
        suspendReason: s.drivers.suspendReason,
      })
      .from(s.drivers)
      .orderBy(desc(s.drivers.active), asc(s.drivers.name)),
    driverRatings(),
    db
      .select({
        driverId: s.bookings.driverId,
        done: sql<number>`count(*) filter (where ${s.bookings.status} = 'completed')::int`,
        upcoming: sql<number>`count(*) filter (where ${s.bookings.status} = 'confirmed')::int`,
      })
      .from(s.bookings)
      .where(sql`${s.bookings.driverId} is not null`)
      .groupBy(s.bookings.driverId),
  ]);
  const tripCount = new Map(trips.map((t) => [t.driverId!, t]));
  const [vehicleRows, docRows] = await Promise.all([
    db
      .select({ id: s.vehicles.id, name: s.vehicles.nameAr })
      .from(s.vehicles)
      .orderBy(asc(s.vehicles.sortOrder)),
    db
      .select({
        driverId: s.driverDocuments.driverId,
        kind: s.driverDocuments.kind,
      })
      .from(s.driverDocuments),
  ]);
  const docsOf = (id: number) =>
    docRows.filter((d) => d.driverId === id).map((d) => d.kind);
  const pending = rows
    .filter((d) => d.status === "pending")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const rejected = rows.filter((d) => d.status === "rejected");
  const team = rows.filter((d) => d.status === "approved");
  const heldCount = team.filter((d) => driverHold(d)).length;
  // the result of a block / suspend / lift, shown after the page reloads
  // money: what each driver earned, was paid and is still owed
  const [money, payoutRows] = await Promise.all([
    driverMoney(team.map((d) => d.id)),
    team.length ? db.select().from(s.driverPayouts).where(inArray(s.driverPayouts.driverId, team.map((d) => d.id))).orderBy(desc(s.driverPayouts.paidOn), desc(s.driverPayouts.id)) : Promise.resolve([]),
  ]);
  const paidKey = typeof sp.paid === "string" ? sp.paid : typeof sp.unpaid === "string" ? sp.unpaid : "";
  const holdKey = (["suspended", "resumed", "blocked", "unblocked"] as const).find((k) => typeof sp[k] === "string");
  const holdDriver = holdKey ? rows.find((d) => String(d.id) === sp[holdKey]) : undefined;
  const holdTrips = holdDriver && (holdKey === "suspended" || holdKey === "blocked") ? await upcomingTrips(holdDriver.id) : [];

  return (
    <div className="space-y-6 max-w-4xl">
      <p className="text-muted max-w-[70ch]">
        سجّل سائقيك هنا، ثم اختر السائق من صفحة أي حجز مدفوع: تصل للسائق بيانات
        العميل، وتصل للعميل بيانات السائق وصورته على واتساب تلقائيًا. هذا القسم
        داخل لوحة التحكم فقط ولا يظهر في الموقع.
      </p>
      {(sp.added || sp.deleted || sp.approved || sp.rejected) && (
        <p
          role="status"
          className="rounded-lg bg-sign-soft border border-sign/20 px-4 py-3 text-sign"
        >
          {sp.added
            ? "تمت إضافة السائق."
            : sp.approved
              ? "تم قبول السائق وتفعيل حسابه. رسالة القبول في «رسائل واتساب والبريد»."
              : sp.rejected
                ? "تم رفض الطلب. رسالة الرفض في «رسائل واتساب والبريد»."
                : "تم حذف السائق."}
        </p>
      )}

      <section aria-labelledby="applications" data-testid="applications">
        <h2 id="applications" className="text-xl font-semibold mb-1">
          طلبات الانضمام{" "}
          {pending.length > 0 && (
            <span className="text-amber-deep">
              ({formatNumber(pending.length, "ar")})
            </span>
          )}
        </h2>
        <p className="text-sm text-muted mb-3">
          السائقون يسجّلون بأنفسهم من صفحة{" "}
          <a
            href="/ar/drivers/join"
            target="_blank"
            className="text-sign hover:underline"
          >
            انضم كسائق
          </a>{" "}
          (رابطها أسفل كل صفحة في الموقع). راجع الصور ثم اقبل الطلب أو ارفضه.
        </p>
        {pending.length === 0 ? (
          <p className="text-muted text-sm">لا توجد طلبات جديدة.</p>
        ) : (
          <ul className="space-y-4">
            {pending.map((d) => (
              <li key={d.id}>
                <Card
                  className="border-amber border-2 p-4 space-y-4"
                  data-testid="application"
                >
                  <div className="flex flex-wrap gap-4">
                    <DriverPhoto d={d} className="size-20 rounded-xl" />
                    <div className="min-w-0 flex-1 text-sm space-y-1">
                      <p className="font-semibold text-[16px]">{d.name}</p>
                      <p
                        dir="ltr"
                        className="text-muted"
                        style={{ textAlign: "right" }}
                      >
                        {d.phone}
                      </p>
                      <p>
                        {[d.carType, d.carModel, d.carColor]
                          .filter(Boolean)
                          .join(" · ")}{" "}
                        · اللوحة{" "}
                        <bdi className="font-medium">{d.plateNumber}</bdi>
                      </p>
                      <p className="text-muted">
                        قدّم الطلب: {formatDateTime(d.createdAt, "ar")}
                      </p>
                    </div>
                    <a
                      href={waLink(d.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost !min-h-9 !py-1 text-sm self-start"
                    >
                      <WhatsAppIcon className="size-4" /> واتساب
                    </a>
                  </div>
                  <DocGallery id={d.id} kinds={docsOf(d.id)} />
                  <div className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
                    <ActionForm
                      action={approveDriver}
                      submitLabel="قبول السائق وتفعيل حسابه"
                      pendingLabel="جارٍ القبول…"
                      className=""
                    >
                      <input type="hidden" name="id" value={d.id} />
                    </ActionForm>
                    <details className="flex-1 min-w-60">
                      <summary className="cursor-pointer text-sm text-danger">
                        رفض الطلب
                      </summary>
                      <ActionForm
                        action={rejectDriver}
                        submitLabel="رفض الطلب"
                        submitClassName="btn !bg-danger !text-white !min-h-9 !py-1 text-sm"
                        className="mt-2 space-y-2"
                      >
                        <input type="hidden" name="id" value={d.id} />
                        <Field label="السبب (يصل للسائق)">
                          <input
                            name="reason"
                            maxLength={300}
                            placeholder="مثال: صورة الاستمارة غير واضحة"
                            className="field"
                          />
                        </Field>
                      </ActionForm>
                    </details>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Card className="p-6">
        <h2 className="font-semibold mb-4">إضافة سائق</h2>
        <DriverFields key={`new-${rows.length}`} vehicles={vehicleRows} />
      </Card>

      <h2 className="text-xl font-semibold pt-2">
        فريق السائقين
        {heldCount > 0 && (
          <span className="ms-2 text-sm font-normal text-muted">
            ({formatNumber(heldCount, "ar")} محظور أو موقوف)
          </span>
        )}
      </h2>
      {team.length === 0 ? (
        <p className="text-muted">لا يوجد سائقون بعد.</p>
      ) : (
        <ul className="space-y-4" data-testid="driver-list">
          {team.map((d) => {
            const r = ratings.get(d.id);
            const t = tripCount.get(d.id);
            const hold = driverHold(d);
            return (
              <li key={d.id} data-driver={d.id} id={`driver-${d.id}`} className="scroll-mt-4 space-y-2">
                {holdDriver?.id === d.id && (
        <div role="status" data-testid="hold-notice" className={`rounded-lg border px-4 py-3 space-y-1 ${holdKey === "blocked" || holdKey === "suspended" ? "bg-amber/15 border-amber/40" : "bg-sign-soft border-sign/20 text-sign"}`}>
          <p>
            {holdKey === "suspended"
              ? `تم إيقاف ${holdDriver.name} مؤقتًا حتى ${holdDriver.suspendedUntil ? formatDateTime(holdDriver.suspendedUntil, "ar") : ""}.`
              : holdKey === "blocked"
                ? `تم حظر ${holdDriver.name}.`
                : holdKey === "resumed"
                  ? `انتهى إيقاف ${holdDriver.name}، ويقدر يدخل ويستقبل الرحلات الآن.`
                  : `تم إلغاء حظر ${holdDriver.name}.`}
          </p>
          {holdTrips.length > 0 && (
            <p className="text-sm">
              تنبيه: عنده {holdTrips.length === 1 ? "رحلة قادمة" : `${formatNumber(holdTrips.length, "ar")} رحلات قادمة`}، أسندها لسائق آخر:{" "}
              {holdTrips.map((t, i) => (
                <span key={t.ref}>
                  {i > 0 && "، "}
                  <Link href={`/admin/bookings/${t.ref}`} className="underline font-medium">
                    {t.no}
                  </Link>
                </span>
              ))}
            </p>
          )}
        </div>
                )}
                <Card className={`overflow-hidden ${hold ? "opacity-90 border-danger/30" : ""}`}>
                  <div className="flex flex-wrap gap-4 p-4">
                    <DriverPhoto d={d} className="size-20 rounded-xl" />
                    <div className="min-w-0 flex-1 space-y-1 text-sm">
                      <p className="font-semibold text-[16px]">
                        {d.name}{" "}
                        {!d.active && !hold && (
                          <span className="text-danger text-sm font-normal">
                            · غير متاح للرحلات
                          </span>
                        )}
                      </p>
                      {hold && (
                        <p
                          data-testid="driver-hold"
                          className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${hold.kind === "blocked" ? "bg-danger-soft text-danger" : "bg-amber/20 text-amber-deep"}`}
                        >
                          {hold.kind === "blocked"
                            ? "محظور"
                            : `موقوف مؤقتًا حتى ${formatDateTime(hold.until, "ar")}`}
                          {hold.reason ? ` · ${hold.reason}` : ""}
                        </p>
                      )}
                      <p
                        dir="ltr"
                        className="text-muted"
                        style={{ textAlign: "right" }}
                      >
                        {d.phone}
                      </p>
                      <p>
                        {[d.carType, d.carModel, d.carColor]
                          .filter(Boolean)
                          .join(" · ")}{" "}
                        · اللوحة{" "}
                        <bdi className="font-medium">{d.plateNumber}</bdi>
                      </p>
                      <p className="text-muted flex flex-wrap items-center gap-x-3">
                        {r ? (
                          <Link
                            href={`/admin/ratings?driver=${d.id}`}
                            className="inline-flex items-center gap-1 hover:text-ink"
                          >
                            <Stars value={r.avg} size="sm" />{" "}
                            {formatNumber(r.avg, "ar", 1)} (
                            {formatNumber(r.count, "ar")} تقييم)
                          </Link>
                        ) : (
                          <span>لا تقييمات بعد</span>
                        )}
                        <span>
                          {formatNumber(t?.done ?? 0, "ar")} رحلة منتهية،{" "}
                          {formatNumber(t?.upcoming ?? 0, "ar")} قادمة
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      <a
                        href={waLink(d.phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-ghost !min-h-9 !py-1 text-sm"
                      >
                        <WhatsAppIcon className="size-4" /> واتساب
                      </a>
                      <ActionForm
                        action={deleteDriver}
                        submitLabel="حذف"
                        pendingLabel="جارٍ الحذف…"
                        submitClassName="btn btn-ghost !min-h-9 !py-1 text-sm !text-danger"
                        className=""
                      >
                        <input type="hidden" name="id" value={d.id} />
                      </ActionForm>
                    </div>
                  </div>
                  <MoneyPanel d={d} m={money.get(d.id)!} payouts={payoutRows.filter((p) => p.driverId === d.id)} open={paidKey === String(d.id)} notice={paidKey === String(d.id) ? (typeof sp.paid === "string" ? "تم تسجيل الدفعة." : "تم حذف الدفعة.") : null} />
                  <HoldControls d={d} hold={hold} />
                  <details className="border-t border-line">
                    <summary className="cursor-pointer px-4 py-3 text-sm text-sign">
                      تعديل بيانات السائق
                    </summary>
                    <div className="px-4 pb-5 space-y-4">
                      <DriverFields d={d} vehicles={vehicleRows} />
                      {docsOf(d.id).length > 0 && (
                        <DocGallery id={d.id} kinds={docsOf(d.id)} />
                      )}
                      {d.hasPhoto && (
                        <ActionForm
                          action={removeDriverPhoto}
                          submitLabel="حذف الصورة الشخصية"
                          submitClassName="btn btn-ghost !min-h-9 !py-1 text-sm !text-danger"
                          className=""
                        >
                          <input type="hidden" name="id" value={d.id} />
                        </ActionForm>
                      )}
                    </div>
                  </details>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {rejected.length > 0 && (
        <details className="rounded-xl border border-line bg-paper p-4">
          <summary className="cursor-pointer font-medium">
            طلبات مرفوضة ({formatNumber(rejected.length, "ar")})
          </summary>
          <ul className="mt-3 divide-y divide-line text-sm">
            {rejected.map((d) => (
              <li
                key={d.id}
                className="py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <span>
                  {d.name} · <bdi dir="ltr">{d.phone}</bdi>
                  {d.rejectReason && (
                    <span className="text-muted"> · {d.rejectReason}</span>
                  )}
                </span>
                <span className="flex gap-2">
                  <ActionForm
                    action={approveDriver}
                    submitLabel="قبول"
                    submitClassName="btn btn-ghost !min-h-8 !py-0.5 text-sm"
                    className=""
                  >
                    <input type="hidden" name="id" value={d.id} />
                  </ActionForm>
                  <ActionForm
                    action={deleteDriver}
                    submitLabel="حذف"
                    submitClassName="btn btn-ghost !min-h-8 !py-0.5 text-sm !text-danger"
                    className=""
                  >
                    <input type="hidden" name="id" value={d.id} />
                  </ActionForm>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Earned / paid / remaining, the payouts, and a form to record a new one */
function MoneyPanel({ d, m, payouts, open, notice }: { d: Row; m: DriverMoney; payouts: DriverPayout[]; open: boolean; notice: string | null }) {
  return (
    <details className="border-t border-line" open={open} data-testid="driver-money-admin">
      <summary className="cursor-pointer px-4 py-3 text-sm text-sign flex flex-wrap gap-x-4 gap-y-1">
        <span>المستحقات</span>
        <span className="text-muted tabular">
          المستحق {formatSAR(m.earned, "ar")} · المدفوع {formatSAR(m.paid, "ar")} · <span className={m.remaining > 0 ? "text-amber-deep font-medium" : ""}>الباقي {formatSAR(m.remaining, "ar")}</span>
        </span>
      </summary>
      <div className="px-4 pb-5 space-y-4">
        {notice && (
          <p role="status" className="text-sm text-sign">
            {notice}
          </p>
        )}
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          {[
            ["المستحق (رحلات منتهية)", m.earned],
            ["المدفوع له", m.paid],
            ["الباقي له", m.remaining],
            ["في رحلات قادمة", m.coming],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-lg bg-stone px-3 py-2">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="font-semibold tabular">{formatSAR(v as number, "ar")}</dd>
            </div>
          ))}
        </dl>
        {m.unpriced > 0 && <p className="text-xs text-amber-deep">عنده {formatNumber(m.unpriced, "ar")} رحلة بدون أجرة محددة. حدّدها من صفحة الحجز.</p>}
        <div className="text-sm">
          <p className="text-muted mb-1">الحساب البنكي</p>
          <p className="whitespace-pre-line rounded-lg border border-line px-3 py-2 min-h-10">{d.bankAccount || "لم يضف حسابًا بنكيًا بعد."}</p>
        </div>
        <ActionForm action={addDriverPayout} submitLabel="تسجيل الدفعة" submitClassName="btn btn-primary !min-h-10 text-sm" className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr] items-end">
          <input type="hidden" name="driverId" value={d.id} />
          <Field label="المبلغ المدفوع (ر.س)">
            <input name="amount" inputMode="decimal" required dir="ltr" className="field text-start tabular" placeholder="500" />
          </Field>
          <Field label="تاريخ الدفع">
            <input name="paidOn" type="date" required defaultValue={todayInRiyadh()} className="field" />
          </Field>
          <Field label="ملاحظة (اختياري)">
            <input name="note" maxLength={200} className="field" placeholder="تحويل بنكي، نقدًا…" />
          </Field>
        </ActionForm>
        {payouts.length > 0 && (
          <ul className="divide-y divide-line border border-line rounded-lg text-sm" data-testid="payout-list">
            {payouts.map((p) => (
              <li key={p.id} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                <span>
                  {formatDate(p.paidOn, "ar")}
                  {p.note && <span className="text-muted"> · {p.note}</span>}
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-medium tabular">{formatSAR(p.amount, "ar")}</span>
                  <ActionForm action={deleteDriverPayout} submitLabel="حذف" submitClassName="text-xs text-danger hover:underline" className="">
                    <input type="hidden" name="id" value={p.id} />
                  </ActionForm>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

/** Block, or suspend for a while; or lift either */
function HoldControls({ d, hold }: { d: Row; hold: ReturnType<typeof driverHold> }) {
  if (hold?.kind === "blocked")
    return (
      <div className="border-t border-line px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted">
          محظور منذ {formatDateTime(d.blockedAt!, "ar")}. لا يقدر يدخل ولا تُسند له رحلات ولا يقدر يقدّم طلبًا جديدًا برقمه.
        </span>
        <ActionForm action={unblockDriver} submitLabel="إلغاء الحظر" submitClassName="btn btn-ghost !min-h-9 !py-1 text-sm" className="">
          <input type="hidden" name="id" value={d.id} />
        </ActionForm>
      </div>
    );
  return (
    <details className="border-t border-line" data-testid="hold-controls">
      <summary className="cursor-pointer px-4 py-3 text-sm text-danger">
        {hold ? "إنهاء الإيقاف أو الحظر" : "إيقاف مؤقت أو حظر"}
      </summary>
      <div className="px-4 pb-5 grid gap-4 md:grid-cols-2">
        {hold?.kind === "suspended" ? (
          <div className="rounded-lg border border-line p-4 space-y-3">
            <h3 className="font-medium">الإيقاف المؤقت</h3>
            <p className="text-sm text-muted">
              ينتهي تلقائيًا في {formatDateTime(hold.until, "ar")}. تقدر تنهيه الآن.
            </p>
            <ActionForm action={endSuspension} submitLabel="إنهاء الإيقاف الآن" submitClassName="btn btn-ghost border border-line text-sm" className="space-y-2">
              <input type="hidden" name="id" value={d.id} />
            </ActionForm>
          </div>
        ) : (
          <ActionForm action={suspendDriver} submitLabel="إيقاف مؤقت" submitClassName="btn btn-ghost border border-line text-sm" className="rounded-lg border border-line p-4 space-y-3">
            <h3 className="font-medium">إيقاف مؤقت</h3>
            <p className="text-xs text-muted">ما يقدر يدخل ولا تُسند له رحلات حتى تنتهي المدة، وبعدها يرجع تلقائيًا.</p>
            <input type="hidden" name="id" value={d.id} />
            <Field label="المدة">
              <select name="period" defaultValue="1" className="field">
                {SUSPEND_DAYS.map((n) => (
                  <option key={n} value={n}>
                    {daysLabel(n)}
                  </option>
                ))}
                <option value="date">حتى تاريخ معيّن…</option>
              </select>
            </Field>
            <Field label="حتى تاريخ" hint="يُستخدم إذا اخترت «حتى تاريخ معيّن». ينتهي الإيقاف آخر ذلك اليوم.">
              <input type="date" name="until" min={todayInRiyadh()} className="field" />
            </Field>
            <Field label="السبب (اختياري)">
              <input name="reason" maxLength={300} className="field" placeholder="مثال: تأخر متكرر عن المواعيد" />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="tell" defaultChecked className="size-4 accent-sign" />
              أبلغ السائق على واتساب
            </label>
          </ActionForm>
        )}
        <ActionForm action={blockDriver} submitLabel="حظر السائق" submitClassName="btn btn-ghost border border-danger/40 !text-danger text-sm" className="rounded-lg border border-danger/30 p-4 space-y-3">
          <h3 className="font-medium text-danger">حظر</h3>
          <p className="text-xs text-muted">إيقاف دائم: ما يقدر يدخل ولا تُسند له رحلات ولا يقدر يسجّل من جديد برقمه، لين تلغي الحظر بنفسك.</p>
          <input type="hidden" name="id" value={d.id} />
          <Field label="السبب (اختياري)">
            <input name="reason" maxLength={300} className="field" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="tell" defaultChecked className="size-4 accent-sign" />
            أبلغ السائق على واتساب
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="confirm" className="size-4 accent-sign" />
            متأكد من حظر هذا السائق
          </label>
        </ActionForm>
      </div>
    </details>
  );
}

/** The application photos; each opens full size in a new tab */
function DocGallery({ id, kinds }: { id: number; kinds: string[] }) {
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-5 items-start">
      {DOC_KINDS.map((k) => (
        <figure key={k} className="text-xs">
          {kinds.includes(k) ? (
            <a
              href={`/api/admin/drivers/${id}/doc/${k}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg overflow-hidden border border-line bg-stone"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- private document from our own API route */}
              <img
                src={`/api/admin/drivers/${id}/doc/${k}`}
                alt={DOC_LABELS[k].ar}
                className={`w-full ${CARD_DOCS.includes(k) ? "object-contain" : "h-28 object-cover"}`}
                style={CARD_DOCS.includes(k) ? { aspectRatio: `${CARD_CM.w} / ${CARD_CM.h}` } : undefined}
              />
            </a>
          ) : (
            <div className="grid place-items-center h-28 rounded-lg border border-dashed border-line text-muted">
              لا توجد
            </div>
          )}
          <figcaption className="mt-1 text-muted">
            {DOC_LABELS[k].ar}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

const PHOTO_LABELS = {
  pick: "اختر صورة",
  change: "تغيير",
  tooBig: "الصورة كبيرة جدًا.",
  unreadable: "هذا الملف ليس صورة صالحة. اختر صورة PNG أو JPG أو WEBP.",
  cardSize: "تُقص بمقاس البطاقة: ٩٫٥٦ × ٦٫٤ سم",
  photoSize: "تُقص بمقاس صورة شخصية: ٤ × ٤ سم",
  crop: { cropTitle: "قص الصورة", cropHint: "اسحب الصورة وكبّرها حتى يملأ الوجه الإطار.", zoom: "تكبير", rotate: "تدوير", cropOk: "اعتماد", cancel: "إلغاء" },
};

function DriverFields({ d, vehicles }: { d?: Row; vehicles: VehicleOption[] }) {
  return (
    <ActionForm action={saveDriver} submitLabel={d ? "حفظ" : "إضافة السائق"}>
      {d && <input type="hidden" name="id" value={d.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="اسم السائق">
          <input
            name="name"
            required
            minLength={2}
            maxLength={80}
            defaultValue={d?.name}
            className="field"
          />
        </Field>
        <Field
          label="رقم الجوال (واتساب)"
          hint="مثل 0501234567. تصل عليه رسائل الرحلات"
        >
          <input
            name="phone"
            type="tel"
            required
            maxLength={20}
            defaultValue={d?.phone}
            dir="ltr"
            className="field text-start"
            inputMode="tel"
          />
        </Field>
        <div className="sm:col-span-2">
          <PlateFields value={d?.plateNumber} label="رقم اللوحة" lettersLabel="الحروف" digitsLabel="الأرقام" />
        </div>
        <Field label="نوع السيارة" hint="من قائمة السيارات في لوحة التحكم">
          <select
            name="vehicleId"
            required
            defaultValue={d?.vehicleId ?? ""}
            className="field"
          >
            <option value="" disabled>
              اختر
              {d && !d.vehicleId && d.carType ? ` (الحالي: ${d.carType})` : ""}
            </option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الموديل (سنة الصنع)">
          <select
            name="carModel"
            defaultValue={d?.carModel ?? ""}
            className="field"
          >
            <option value="">—</option>
            {modelYears().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
        <Field label="اللون">
          <ColorSelect value={d?.carColor} lang="ar" required={false} />
        </Field>
        <div>
          <PhotoField name="photo" label={d?.hasPhoto ? "صورة شخصية جديدة (اختياري)" : "الصورة الشخصية"} t={PHOTO_LABELS} required={false} />
          <p className="text-xs text-muted mt-1">تظهر للعميل في صفحة حجزه.</p>
        </div>
        <Field label="الحساب البنكي للسائق" hint="اسم البنك والآيبان واسم صاحب الحساب. السائق يقدر يعدّله من حسابه" className="sm:col-span-2">
          <textarea name="bankAccount" rows={2} maxLength={300} defaultValue={d?.bankAccount ?? ""} className="field" />
        </Field>
        <Field label="ملاحظات داخلية (اختياري)">
          <input
            name="notes"
            maxLength={500}
            defaultValue={d?.notes}
            className="field"
          />
        </Field>
      </div>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="active"
          defaultChecked={d?.active ?? true}
          className="size-4 accent-sign"
        />
        متاح لإسناد الرحلات
      </label>
    </ActionForm>
  );
}
