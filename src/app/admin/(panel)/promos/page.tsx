import Link from "next/link";
import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { getSettings } from "@/lib/catalog";
import { promoSettings, PROMO_EVERY_CHOICES } from "@/lib/promo";
import { bookingNo, formatDateTime, formatNumber } from "@/lib/format";
import { resendPromo, savePromoSettings } from "../../promo-actions";
import { ActionForm } from "@/components/admin/action-form";
import { Card, Field, PageHeader, Skeleton } from "@/components/admin/ui";

export default function PromosPage() {
  return (
    <>
      <PageHeader title="الرموز الترويجية" />
      <Suspense fallback={<Skeleton h="h-96" />}>
        <Promos />
      </Suspense>
    </>
  );
}

async function Promos() {
  await requireSection("promos");
  const [st, rows] = await Promise.all([
    getSettings(),
    db
      .select({ p: s.promoCodes, usedNo: s.bookings.number, usedRef: s.bookings.ref })
      .from(s.promoCodes)
      .leftJoin(s.bookings, eq(s.bookings.id, s.promoCodes.usedBookingId))
      .orderBy(desc(s.promoCodes.id))
      .limit(500),
  ]);
  const cfg = promoSettings(st);
  const used = rows.filter((r) => r.p.usedAt).length;

  return (
    <div className="space-y-6 max-w-6xl">
      <Card className="p-6" data-testid="promo-settings">
        <h2 className="font-semibold mb-1">إرسال الرمز تلقائيًا</h2>
        <p className="text-sm text-muted mb-4 max-w-[75ch]">
          العميل اللي يكمل عدد الحجوزات المدفوعة (بنفس رقم الجوال) يوصله رمز ترويجي خاص على الواتساب والإيميل، ويكتبه في خانة «الرمز الترويجي» وقت الحجز. الرمز يُستخدم مرة وحدة.
        </p>
        <ActionForm action={savePromoSettings} submitLabel="حفظ">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="promo_enabled" defaultChecked={cfg.enabled} className="size-4 accent-sign" />
            تفعيل الرموز الترويجية
          </label>
          <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
            <Field label="يُرسل الرمز بعد كل" hint="عدد الحجوزات المدفوعة للعميل">
              <select name="promo_every" defaultValue={String(cfg.every)} className="field">
                {[...new Set<number>([...PROMO_EVERY_CHOICES, cfg.every])]
                  .sort((a, b) => a - b)
                  .map((n) => (
                    <option key={n} value={n}>
                      {formatNumber(n, "ar")} حجوزات
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="نسبة الخصم ٪" hint="من سعر الحجز قبل الضريبة">
              <input name="promo_percent" type="number" min={1} max={100} required defaultValue={cfg.percent} dir="ltr" className="field text-start" />
            </Field>
          </div>
        </ActionForm>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["الرموز المرسلة", rows.length],
            ["المستخدمة", used],
            ["لم تُستخدم بعد", rows.length - used],
          ] as const
        ).map(([k, n]) => (
          <Card key={k} className="p-4">
            <p className="text-sm text-muted">{k}</p>
            <p className="text-2xl font-semibold tabular">{formatNumber(n, "ar")}</p>
          </Card>
        ))}
      </div>

      <Card>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="promo-list">
              <thead className="text-muted text-xs">
                <tr className="border-b border-line">
                  {["الاسم", "رقم الجوال", "الإيميل", "الرمز", "الخصم", "بعد حجز رقم", "التاريخ", "الحالة", ""].map((h, i) => (
                    <th key={i} className="text-start font-medium py-2.5 px-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, usedNo, usedRef }) => (
                  <tr key={p.id} className="border-b border-line last:border-0 align-middle" data-code={p.code}>
                    <td className="py-2.5 px-3 font-medium">{p.customerName}</td>
                    <td className="py-2.5 px-3">
                      <bdi dir="ltr">{p.customerPhone}</bdi>
                    </td>
                    <td className="py-2.5 px-3">{p.customerEmail ? <bdi dir="ltr">{p.customerEmail}</bdi> : <span className="text-muted">—</span>}</td>
                    <td className="py-2.5 px-3 font-mono font-semibold" dir="ltr">
                      {p.code}
                    </td>
                    <td className="py-2.5 px-3 tabular">{formatNumber(p.percent, "ar")}٪</td>
                    <td className="py-2.5 px-3 tabular">{formatNumber(p.bookingsCount, "ar")}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap">{formatDateTime(p.createdAt, "ar")}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap" data-status={p.usedAt ? "used" : "new"}>
                      {p.usedAt ? (
                        <span>
                          مستخدم{" "}
                          {usedRef && (
                            <Link href={`/admin/bookings/${usedRef}`} className="text-sign hover:underline">
                              <bdi dir="ltr">{bookingNo(usedNo)}</bdi>
                            </Link>
                          )}
                        </span>
                      ) : (
                        <span className="text-sign">لم يُستخدم</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {!p.usedAt && (
                        <ActionForm action={resendPromo} submitLabel="إرسال مرة أخرى" pendingLabel="جارٍ الإرسال…" submitClassName="btn btn-ghost border border-line !min-h-8 !py-0.5 text-xs" className="">
                          <input type="hidden" name="id" value={p.id} />
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-6 text-muted">لا توجد رموز بعد. يُرسل أول رمز تلقائيًا لما يكمل عميل {formatNumber(cfg.every, "ar")} حجوزات مدفوعة.</p>
        )}
      </Card>
    </div>
  );
}
