import { Suspense } from "react";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { getSettings } from "@/lib/catalog";
import { promoSettings, publicPromo } from "@/lib/promo";
import { publicBaseUrl } from "@/lib/public-url";
import { CopyText } from "@/components/admin/copy-text";
import { formatNumber } from "@/lib/format";
import { countryOptions } from "@/lib/countries";
import { addPromoCustomer, resendPromo, savePromoSettings, savePublicPromo } from "../../promo-actions";
import { PhoneCountryField } from "@/components/site/phone-country-field";
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
      .select({ p: s.promoCodes })
      .from(s.promoCodes)
      .orderBy(desc(s.promoCodes.id))
      .limit(500),
  ]);
  const cfg = promoSettings(st);
  const used = rows.filter((r) => r.p.usedAt).length;
  const pub = publicPromo(st);
  const [{ n: pubUsed }] = pub.code
    ? await db.select({ n: count() }).from(s.bookings).where(and(eq(s.bookings.promoCode, pub.code), inArray(s.bookings.status, ["paid", "confirmed", "completed"])))
    : [{ n: 0 }];
  const site = await publicBaseUrl();
  const pubMessage = pub.code
    ? `عرض خاص من Mighty Hands Trans 🚘\nاستخدم الرمز ${pub.code} واحصل على خصم ${formatNumber(pub.percent, "ar")}٪ على حجزك.\nاحجز من هنا: ${site}/ar`
    : "";

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
            <Field label="يُرسل الرمز بعد كل (عدد الحجوزات)" hint="اكتب العدد اللي تبيه: ٥ أو ١٠ أو ٢٠ أو غيره">
              <input name="promo_every" type="number" min={1} max={1000} required defaultValue={cfg.every} dir="ltr" className="field text-start" />
            </Field>
            <Field label="نسبة الخصم ٪" hint="من سعر الحجز قبل الضريبة">
              <input name="promo_percent" type="number" min={1} max={100} required defaultValue={cfg.percent} dir="ltr" className="field text-start" />
            </Field>
          </div>
        </ActionForm>
      </Card>

      {/* one code for everyone: copy it and send it to all */}
      <Card className="p-6" data-testid="promo-public">
        <h2 className="font-semibold mb-1">رمز عام للكل</h2>
        <p className="text-sm text-muted mb-4 max-w-[75ch]">
          رمز واحد تنسخه وترسله لكل عملائك (واتساب، سناب، إنستقرام…). كل رقم جوال يستخدمه مرة وحدة، وتقدر توقفه أو تغيّره متى ما تبي.
        </p>
        {pub.code && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-stone px-4 py-3">
            <span className="text-sm text-muted">الرمز:</span>
            <bdi dir="ltr" className="font-mono text-xl font-semibold tracking-wider" data-testid="promo-public-code">
              {pub.code}
            </bdi>
            <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${pub.enabled ? "bg-sign-soft text-sign" : "bg-danger-soft text-danger"}`} data-testid="promo-public-state">
              {pub.enabled ? `شغّال · خصم ${formatNumber(pub.percent, "ar")}٪` : "موقوف"}
            </span>
            <span className="text-sm text-muted">استُخدم {formatNumber(pubUsed, "ar")} مرة</span>
            <span className="ms-auto flex flex-wrap gap-2">
              <CopyText text={pub.code} label="نسخ الرمز" testId="copy-public-code" />
              <CopyText text={pubMessage} label="نسخ رسالة جاهزة" testId="copy-public-message" />
            </span>
          </div>
        )}
        <ActionForm action={savePublicPromo} submitLabel="حفظ الرمز العام">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="promo_public_enabled" defaultChecked={pub.enabled || !pub.code} className="size-4 accent-sign" />
            تفعيل الرمز العام
          </label>
          <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
            <Field label="الرمز" hint="حروف وأرقام إنجليزية؛ اتركه فاضي ونسوي لك رمز">
              <input name="promo_public_code" maxLength={20} defaultValue={pub.code} dir="ltr" className="field text-start uppercase" placeholder="MHT2026" />
            </Field>
            <Field label="نسبة الخصم ٪">
              <input name="promo_public_percent" type="number" min={1} max={100} required defaultValue={pub.percent} dir="ltr" className="field text-start" />
            </Field>
          </div>
        </ActionForm>
      </Card>

      {/* the admin adds a customer and sends them a code */}
      <Card className="p-6" data-testid="promo-add">
        <h2 className="font-semibold mb-1">إضافة عميل وإرسال رمز له</h2>
        <p className="text-sm text-muted mb-4">يوصله رمز بخصم {formatNumber(cfg.percent, "ar")}٪ على الواتساب، وعلى الإيميل إذا كتبته.</p>
        <ActionForm action={addPromoCustomer} submitLabel="إضافة وإرسال الرمز" pendingLabel="جارٍ الإرسال…">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="اسم العميل">
              <input name="name" required minLength={2} maxLength={100} className="field" />
            </Field>
            <PhoneCountryField countries={countryOptions("ar")} defaultCountry="SA" defaultValue="" label="رقم الواتساب" countryLabel="رمز الدولة" hint="اختر الدولة ثم اكتب الرقم." />
            <Field label="الإيميل (اختياري)">
              <input name="email" type="email" maxLength={200} dir="ltr" className="field text-start" />
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
                  {["اسم العميل", "رقم الواتساب", "الإيميل", ""].map((h, i) => (
                    <th key={i} className="text-start font-medium py-2.5 px-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p }) => (
                  <tr key={p.id} className="border-b border-line last:border-0 align-middle" data-code={p.code} data-status={p.usedAt ? "used" : "new"}>
                    <td className="py-2.5 px-3 font-medium">{p.customerName}</td>
                    <td className="py-2.5 px-3">
                      <bdi dir="ltr">{p.customerPhone}</bdi>
                    </td>
                    <td className="py-2.5 px-3">{p.customerEmail ? <bdi dir="ltr">{p.customerEmail}</bdi> : <span className="text-muted">—</span>}</td>
                    <td className="py-2.5 px-3 text-end">
                      {!p.usedAt && (
                        <ActionForm action={resendPromo} submitLabel="إرسال الرمز مرة أخرى" pendingLabel="جارٍ الإرسال…" submitClassName="btn btn-ghost border border-line !min-h-8 !py-0.5 text-xs" className="">
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
