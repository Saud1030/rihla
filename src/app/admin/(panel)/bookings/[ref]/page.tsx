import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireSection } from "@/lib/auth";
import { getBookingWithPayments } from "@/lib/admin-data";
import {
  adminCancelWithRefund,
  approveRefund,
  confirmBankTransfer,
  markRefundManual,
  updateBooking,
} from "../../../actions";
import { getSettings } from "@/lib/catalog";
import { cancelQuote, parseCancelPolicy } from "@/lib/policy";
import { getDictionary } from "@/i18n/dictionaries";
import { bookingEnd } from "@/lib/timespan";
import {
  bookingNo,
  formatDate,
  formatDateTime,
  formatNumber,
  formatSAR,
  formatTime,
} from "@/lib/format";
import { ActionForm } from "@/components/admin/action-form";
import { Card, Field, Skeleton } from "@/components/admin/ui";
import { StatusBadge } from "@/components/site/booking-summary";
import { waLink } from "@/components/site/whatsapp-fab";
import { WhatsAppIcon, PhoneIcon } from "@/components/icons";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db, schema as sc } from "@/db";
import { assignDriver, completeTrip } from "../../../driver-actions";
import { notHeld } from "@/lib/driver-hold";
import { invoiceNo, receiptNo } from "@/lib/documents";
import { NotificationList } from "@/components/admin/notification-list";
import { DriverPhoto } from "@/components/admin/driver-photo";
import { Stars } from "@/components/site/stars";
import { whatsappConfigured } from "@/lib/notify";

const t = getDictionary("ar");

export default function BookingDetailPage({
  params,
  searchParams,
}: PageProps<"/admin/bookings/[ref]">) {
  return (
    <>
      <Link
        href="/admin/bookings"
        className="text-sm text-muted hover:text-ink"
      >
        → كل الحجوزات
      </Link>
      <Suspense fallback={<Skeleton h="h-[500px]" />}>
        <Detail params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Detail({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSection("bookings");
  const { ref } = await params;
  const completedNote = {
    sent: "انتهت الرحلة وأُرسل للعميل طلب التقييم على واتساب.",
    ready: "انتهت الرحلة. رسالة طلب التقييم جاهزة في قائمة الرسائل بالأسفل.",
    none: "انتهت الرحلة.",
  }[String((await searchParams).completed ?? "") as "sent" | "ready" | "none"];
  const [b, settings] = await Promise.all([
    getBookingWithPayments(ref),
    getSettings(),
  ]);
  if (!b) notFound();
  const [drivers, messages, [rating]] = await Promise.all([
    db
      .select({
        id: sc.drivers.id,
        name: sc.drivers.name,
        phone: sc.drivers.phone,
        plateNumber: sc.drivers.plateNumber,
        carType: sc.drivers.carType,
        carModel: sc.drivers.carModel,
        carColor: sc.drivers.carColor,
        // blocked or suspended drivers can't be chosen
        active: sql<boolean>`${sc.drivers.active} and ${sc.drivers.status} = 'approved' and ${notHeld}`,
        hasPhoto: sql<boolean>`${sc.drivers.photo} is not null`,
        updatedAt: sc.drivers.updatedAt,
      })
      .from(sc.drivers)
      .orderBy(asc(sc.drivers.name)),
    db
      .select()
      .from(sc.notifications)
      .where(eq(sc.notifications.bookingId, b.id))
      .orderBy(desc(sc.notifications.id)),
    db.select().from(sc.ratings).where(eq(sc.ratings.bookingId, b.id)).limit(1),
  ]);
  const driver = drivers.find((d) => d.id === b.driverId) ?? null;
  const canAssign = b.status === "paid" || b.status === "confirmed";
  const q = cancelQuote(b, { ...parseCancelPolicy(settings), enabled: true });
  // after pickup time the policy gives nothing; the admin can still choose an amount
  const suggested = q.allowed ? q.refund : 0;

  const rows: [string, React.ReactNode][] = [
    ["الرحلة", b.routeTitle],
    ["السيارة", b.vehicleName],
    [
      "طريقة التسعير",
      b.pricingMode === "distance"
        ? `حسب المسافة (حوالي ${formatNumber(b.distanceKm ?? 0, "ar")} كم)`
        : b.pricingMode === "hourly"
          ? `بالساعة مع سائق (${formatNumber(b.hours ?? 0, "ar")} ساعة)`
          : "سعر ثابت",
    ],
    [
      "المبلغ",
      b.vatAmount > 0
        ? `${formatSAR(b.subtotal, "ar")} + ضريبة ${formatNumber(b.vatRate / 100, "ar")}٪ (${formatSAR(b.vatAmount, "ar")}) = ${formatSAR(b.amount, "ar")}`
        : formatSAR(b.amount, "ar"),
    ],
    [
      "موعد الاستلام",
      `${formatDate(b.pickupDate, "ar")} - ${formatTime(b.pickupTime, "ar")}`,
    ],
    ...(bookingEnd(b, "ar")
      ? ([
          [
            b.hours || !b.toLocationId ? "ينتهي الحجز" : "الوصول المتوقع",
            bookingEnd(b, "ar")!,
          ],
        ] as [string, string][])
      : []),
    ["مكان الاستلام", b.pickupAddress],
    ["مكان النزول", b.dropoffAddress ?? "—"],
    [
      "رقم الرحلة الجوية",
      b.flightNumber ? <span dir="ltr">{b.flightNumber}</span> : "—",
    ],
    [
      "الركاب / الحقائب",
      `${formatNumber(b.passengers, "ar")} / ${formatNumber(b.bags, "ar")}`,
    ],
    ["ملاحظات العميل", b.notes ?? "—"],
    ["لغة العميل", b.locale === "ar" ? "العربية" : "English"],
    ["أُنشئ في", formatDateTime(b.createdAt, "ar")],
    ["وقت الدفع", b.paidAt ? formatDateTime(b.paidAt, "ar") : "—"],
  ];

  const msg =
    b.locale === "ar"
      ? `مرحبًا ${b.customerName}، بخصوص حجزك رقم ${b.ref} (${b.routeTitle}) يوم ${formatDate(b.pickupDate, "ar")} الساعة ${formatTime(b.pickupTime, "ar")}.`
      : `Hello ${b.customerName}, about your booking ${b.ref} (${b.routeTitle}) on ${formatDate(b.pickupDate, "en")} at ${formatTime(b.pickupTime, "en")}.`;

  return (
    <>
      {completedNote && (
        <p
          role="status"
          className="mt-3 rounded-lg bg-sign-soft border border-sign/20 px-4 py-3 text-sign"
        >
          {completedNote}
        </p>
      )}
      <div className="mt-3 grid gap-6 lg:grid-cols-[1fr_360px] items-start">
        <div className="space-y-6 min-w-0">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-line">
              <h1 className="font-display text-2xl font-semibold" data-testid="booking-number">
                <bdi dir="ltr">{bookingNo(b.number)}</bdi>
                <span className="ms-3 align-middle text-xs font-sans font-normal text-muted" title="الرمز الذي يراه العميل ويستخدمه في صفحة «حجزي»">
                  رمز العميل <bdi dir="ltr">{b.ref}</bdi>
                </span>
              </h1>
              <div className="flex items-center gap-3">
                <span className="font-display text-xl font-semibold tabular">
                  {formatSAR(b.amount, "ar")}
                </span>
                <StatusBadge status={b.status} t={t} />
              </div>
            </div>
            <dl className="divide-y divide-line">
              {rows.map(([k, v]) => (
                <div
                  key={k}
                  className="grid grid-cols-[150px_1fr] gap-3 px-5 py-2.5 text-[15px]"
                >
                  <dt className="text-muted">{k}</dt>
                  <dd className="min-w-0 break-words whitespace-pre-line">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <h2 className="font-semibold px-5 py-3 border-b border-line">
              سجل المدفوعات
            </h2>
            {b.payments.length ? (
              <table className="w-full text-sm">
                <thead className="text-muted">
                  <tr className="border-b border-line">
                    <th className="text-start font-medium px-5 py-2">
                      رقم العملية
                    </th>
                    <th className="text-start font-medium px-5 py-2">الحالة</th>
                    <th className="text-start font-medium px-5 py-2">
                      الطريقة
                    </th>
                    <th className="text-start font-medium px-5 py-2">المبلغ</th>
                    <th className="text-start font-medium px-5 py-2">
                      التاريخ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {b.payments.map((p) => (
                    <tr key={p.id}>
                      <td
                        className="px-5 py-2 font-mono text-xs"
                        dir="ltr"
                        style={{ textAlign: "right" }}
                      >
                        {p.id}
                        {p.id === b.paymentId && (
                          <span className="ms-2 text-sign font-sans">✓</span>
                        )}
                      </td>
                      <td className="px-5 py-2">{p.status}</td>
                      <td className="px-5 py-2">{p.source ?? "—"}</td>
                      <td className="px-5 py-2 tabular whitespace-nowrap">
                        {formatSAR(p.amount, "ar")}
                      </td>
                      <td className="px-5 py-2 whitespace-nowrap">
                        {formatDateTime(p.updatedAt, "ar")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-5 py-4 text-sm text-muted">
                لم تبدأ أي عملية دفع لهذا الحجز.
              </p>
            )}
            <p className="px-5 py-3 text-xs text-muted border-t border-line">
              طريقة الدفع:{" "}
              {b.paymentMethod === "bank_transfer"
                ? "تحويل بنكي"
                : b.paymentMethod === "myfatoorah"
                  ? "ماي فاتورة"
                  : "لم يختر العميل بعد"}
            </p>
            {(b.receiptNo || b.invoiceNo) && (
              <p className="px-5 py-3 text-sm border-t border-line flex flex-wrap gap-x-6 gap-y-1" data-testid="booking-documents">
                {b.receiptNo && (
                  <a href={`/${b.locale === "en" ? "en" : "ar"}/booking/${b.ref}/receipt`} target="_blank" rel="noopener noreferrer" className="text-sign hover:underline">
                    سند الدفع <span dir="ltr">{receiptNo(b.receiptNo)}</span>
                  </a>
                )}
                {b.invoiceNo ? (
                  <a href={`/${b.locale === "en" ? "en" : "ar"}/booking/${b.ref}/invoice`} target="_blank" rel="noopener noreferrer" className="text-sign hover:underline">
                    الفاتورة <span dir="ltr">{invoiceNo(b.invoiceNo)}</span>
                  </a>
                ) : (
                  <span className="text-muted">الفاتورة تصدر عند انتهاء الرحلة</span>
                )}
              </p>
            )}
          </Card>

          <Card>
            <h2 className="font-semibold px-5 py-3 border-b border-line">
              رسائل واتساب والبريد لهذا الحجز
            </h2>
            <NotificationList rows={messages} />
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-4">
          <Card className="p-5">
            <h2 className="font-semibold">العميل</h2>
            <p className="mt-2">{b.customerName}</p>
            <p className="text-muted" dir="ltr" style={{ textAlign: "right" }}>
              {b.customerPhone}
            </p>
            {b.customerEmail && (
              <p
                className="text-muted text-sm"
                dir="ltr"
                style={{ textAlign: "right" }}
              >
                {b.customerEmail}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={waLink(b.customerPhone, msg)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary !min-h-10"
              >
                <WhatsAppIcon className="size-4" />
                واتساب
              </a>
              <a
                href={`tel:${b.customerPhone}`}
                className="btn btn-ghost !min-h-10"
              >
                <PhoneIcon className="size-4" />
                اتصال
              </a>
            </div>
          </Card>

          <Card
            className={`p-5 ${b.status === "paid" ? "border-amber border-2" : ""}`}
            data-testid="driver-card"
          >
            <h2 className="font-semibold">السائق</h2>
            {driver ? (
              <div className="mt-3 flex gap-3 items-center">
                <DriverPhoto d={driver} className="size-14 rounded-xl" />
                <div className="text-sm min-w-0">
                  <p className="font-medium text-[15px]">{driver.name}</p>
                  <p
                    className="text-muted"
                    dir="ltr"
                    style={{ textAlign: "right" }}
                  >
                    {driver.phone}
                  </p>
                  <p>
                    {[driver.carType, driver.carModel, driver.carColor]
                      .filter(Boolean)
                      .join(" · ")}{" "}
                    · <bdi>{driver.plateNumber}</bdi>
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted mt-1">
                {canAssign
                  ? "لم يُحدَّد سائق بعد."
                  : b.status === "pending_payment"
                    ? "يُحدَّد السائق بعد الدفع."
                    : "—"}
              </p>
            )}
            {b.startedAt && (
              <p className="text-xs text-muted mt-2">
                بدأت الرحلة: {formatDateTime(b.startedAt, "ar")}
              </p>
            )}
            {b.completedAt && (
              <p className="text-xs text-muted mt-1">
                انتهت الرحلة: {formatDateTime(b.completedAt, "ar")}
              </p>
            )}
            {canAssign && (
              <div className="mt-4 space-y-3">
                {drivers.some((d) => d.active) ? (
                  <ActionForm
                    action={assignDriver}
                    submitLabel={
                      driver
                        ? "تغيير السائق وإرسال الرسائل"
                        : "إسناد وإرسال الرسائل"
                    }
                    pendingLabel="جارٍ الإرسال…"
                  >
                    <input type="hidden" name="bookingId" value={b.id} />
                    <Field
                      label={driver ? "سائق آخر" : "اختر السائق"}
                      hint={`تصل للسائق بيانات العميل، وللعميل بيانات السائق على واتساب${whatsappConfigured() ? " تلقائيًا" : ""}.`}
                    >
                      <select
                        name="driverId"
                        required
                        defaultValue=""
                        className="field"
                      >
                        <option value="" disabled>
                          اختر
                        </option>
                        {drivers
                          .filter((d) => d.active)
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} · {d.carType} · {d.plateNumber}
                            </option>
                          ))}
                      </select>
                    </Field>
                  </ActionForm>
                ) : (
                  <p className="text-sm">
                    لا يوجد سائقون.{" "}
                    <Link
                      href="/admin/drivers"
                      className="text-sign hover:underline"
                    >
                      أضف سائقًا
                    </Link>
                  </p>
                )}
                {driver && (
                  <ActionForm
                    action={completeTrip}
                    submitLabel="انتهت الرحلة (اطلب التقييم)"
                    submitClassName="btn btn-ghost !min-h-9 !py-1 text-sm"
                    className=""
                  >
                    <input type="hidden" name="bookingId" value={b.id} />
                  </ActionForm>
                )}
              </div>
            )}
          </Card>

          {rating && (
            <Card className="p-5" data-testid="booking-rating">
              <h2 className="font-semibold mb-2">تقييم العميل</h2>
              <p className="text-sm flex items-center gap-2">
                الشركة <Stars value={rating.companyStars} size="sm" />
              </p>
              <p className="text-sm flex items-center gap-2 mt-1">
                السائق <Stars value={rating.driverStars} size="sm" />
              </p>
              {rating.comment && (
                <p className="text-sm mt-2 bg-stone rounded-md px-3 py-2 whitespace-pre-line">
                  {rating.comment}
                </p>
              )}
            </Card>
          )}

          <Card className="p-5">
            <h2 className="font-semibold mb-3">إدارة الحجز</h2>
            <ActionForm action={updateBooking} submitLabel="حفظ">
              <input type="hidden" name="id" value={b.id} />
              <Field
                label="الحالة"
                hint="«تم الدفع» تُضبط تلقائيًا بعد تحقق بوابة الدفع."
              >
                <select name="status" defaultValue={b.status} className="field">
                  {b.status === "pending_payment" && (
                    <option value="pending_payment">
                      {t.booking.status.pending_payment}
                    </option>
                  )}
                  {b.status === "paid" && (
                    <option value="paid">{t.booking.status.paid}</option>
                  )}
                  {b.status !== "cancelled" && (
                    <option value="confirmed">
                      {t.booking.status.confirmed}
                    </option>
                  )}
                  {b.status !== "cancelled" && (
                    <option value="completed">
                      {t.booking.status.completed}
                    </option>
                  )}
                  {(b.status === "pending_payment" ||
                    b.status === "cancelled") && (
                    <option value="cancelled">
                      {t.booking.status.cancelled}
                    </option>
                  )}
                </select>
              </Field>
              <Field label="ملاحظة داخلية" hint="لا تظهر للعميل.">
                <textarea
                  name="adminNote"
                  rows={4}
                  defaultValue={b.adminNote ?? ""}
                  className="field"
                />
              </Field>
            </ActionForm>
          </Card>

          {(b.status === "paid" || b.status === "confirmed") && (
            <Card className="p-5">
              <h2 className="font-semibold">إلغاء الحجز والاسترداد</h2>
              <p className="text-sm text-muted mt-1 mb-3">
                حسب سياسة الإلغاء الحالية يستحق العميل{" "}
                {formatSAR(suggested, "ar")}. يمكنك تغيير المبلغ (من ٠ حتى{" "}
                {formatSAR(b.amount, "ar")}).
              </p>
              <ActionForm
                action={adminCancelWithRefund}
                submitLabel="إلغاء الحجز"
                submitClassName="btn !bg-danger !text-white"
              >
                <input type="hidden" name="id" value={b.id} />
                <Field label="مبلغ الاسترداد (ريال)">
                  <input
                    name="refund"
                    inputMode="decimal"
                    required
                    defaultValue={suggested / 100}
                    className="field tabular"
                    dir="ltr"
                  />
                </Field>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="sendNow"
                    defaultChecked
                    className="size-4 mt-0.5 accent-sign"
                  />
                  <span>أرسل طلب الاسترداد إلى ماي فاتورة الآن</span>
                </label>
              </ActionForm>
            </Card>
          )}

          {b.status === "pending_payment" && (
            <Card
              className={`p-5 ${b.paymentMethod === "bank_transfer" ? "border-amber border-2" : ""}`}
            >
              <h2 className="font-semibold">التحويل البنكي</h2>
              <p className="text-sm text-muted mt-1 mb-3">
                {b.paymentMethod === "bank_transfer"
                  ? `اختار العميل التحويل البنكي. بعد وصول ${formatSAR(b.amount, "ar")} إلى حسابك اضغط «تأكيد استلام التحويل».`
                  : "إذا حوّل العميل المبلغ إلى حسابك مباشرة، أكّد استلامه هنا."}
              </p>
              {b.receipts.length > 0 ? (
                <div className="mb-4" data-testid="admin-receipts">
                  <p className="text-sm font-medium mb-2">
                    إيصالات العميل ({formatNumber(b.receipts.length, "ar")})
                  </p>
                  <ul className="grid gap-3">
                    {b.receipts.map((r) => (
                      <li
                        key={r.id}
                        className="border border-line rounded-lg overflow-hidden"
                      >
                        {r.mime.startsWith("image/") ? (
                          <a
                            href={`/api/admin/receipts/${r.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block bg-stone"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- private, admin-only file */}
                            <img
                              src={`/api/admin/receipts/${r.id}`}
                              alt={`إيصال ${r.fileName}`}
                              className="w-full h-40 object-contain"
                            />
                          </a>
                        ) : (
                          <a
                            href={`/api/admin/receipts/${r.id}`}
                            className="grid place-items-center h-40 bg-stone text-sign font-medium"
                          >
                            PDF · تنزيل
                          </a>
                        )}
                        <p className="px-3 py-2 text-xs text-muted">
                          <bdi>{r.fileName}</bdi> ·{" "}
                          {formatDateTime(r.createdAt, "ar")}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                b.paymentMethod === "bank_transfer" && (
                  <p className="mb-4 text-sm text-muted">
                    لم يرفع العميل إيصالًا بعد.
                  </p>
                )
              )}
              <ActionForm
                action={confirmBankTransfer}
                submitLabel="تأكيد استلام التحويل"
              >
                <input type="hidden" name="id" value={b.id} />
                <Field
                  label="ملاحظة (اختياري)"
                  hint="مثل رقم العملية أو اسم المحوِّل"
                >
                  <input name="note" maxLength={200} className="field" />
                </Field>
              </ActionForm>
            </Card>
          )}

          {b.status === "cancelled" && b.refundAmount > 0 && (
            <Card
              className={`p-5 ${b.refundStatus === "pending_approval" || b.refundStatus === "failed" ? "border-amber border-2" : ""}`}
            >
              <h2 className="font-semibold">الاسترداد</h2>
              <dl className="mt-2 text-sm space-y-1">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">المبلغ</dt>
                  <dd className="tabular">{formatSAR(b.refundAmount, "ar")}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">الحالة</dt>
                  <dd>{REFUND_LABELS[b.refundStatus]}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">ألغاه</dt>
                  <dd>{b.cancelledBy === "customer" ? "العميل" : "الإدارة"}</dd>
                </div>
                {b.refundReference && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">مرجع ماي فاتورة</dt>
                    <dd dir="ltr">{b.refundReference}</dd>
                  </div>
                )}
              </dl>
              {b.refundError && (
                <p className="mt-2 text-sm text-danger bg-danger-soft rounded-md px-3 py-2">
                  {b.refundError}
                </p>
              )}
              {(b.refundStatus === "pending_approval" ||
                b.refundStatus === "failed") && (
                <div className="mt-4 space-y-3">
                  {b.paymentMethod === "bank_transfer" ? (
                    <p className="text-sm bg-amber/15 rounded-md px-3 py-2">
                      دفع العميل بتحويل بنكي: اطلب منه رقم الآيبان على واتساب،
                      حوّل المبلغ من حسابك، ثم اضغط «تم الاسترداد يدويًا».
                    </p>
                  ) : (
                    <ActionForm
                      action={approveRefund}
                      submitLabel={
                        b.refundStatus === "failed"
                          ? "إعادة إرسال الاسترداد"
                          : "موافقة وإرسال الاسترداد"
                      }
                    >
                      <input type="hidden" name="id" value={b.id} />
                    </ActionForm>
                  )}
                  <ActionForm
                    action={markRefundManual}
                    submitLabel="تم الاسترداد يدويًا"
                    submitClassName="btn btn-ghost !min-h-9 !py-1 text-sm"
                  >
                    <input type="hidden" name="id" value={b.id} />
                  </ActionForm>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

const REFUND_LABELS: Record<string, string> = {
  none: "لا يوجد",
  pending_approval: "بانتظار موافقتك",
  requested: "أُرسل إلى ماي فاتورة",
  manual: "عولج يدويًا",
  failed: "فشل الإرسال",
};
