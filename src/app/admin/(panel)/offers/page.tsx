import { Suspense } from "react";
import { desc } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { getSettings } from "@/lib/catalog";
import { todayInRiyadh } from "@/lib/booking";
import { formatDate, formatNumber } from "@/lib/format";
import { offersEnabled } from "@/lib/price-rules-server";
import { addOffer, deleteOffer, saveOffer, setOffersEnabled, toggleOffer } from "../../price-rule-actions";
import { ActionForm } from "@/components/admin/action-form";
import { Card, Field, PageHeader, Skeleton } from "@/components/admin/ui";
import type { OfferRow } from "@/db/schema";

export default function OffersPage() {
  return (
    <>
      <PageHeader title="العروض" />
      <Suspense fallback={<Skeleton h="h-96" />}>
        <Offers />
      </Suspense>
    </>
  );
}

async function Offers() {
  await requireSection("catalog");
  const [st, rows] = await Promise.all([getSettings(), db.select().from(s.offers).orderBy(desc(s.offers.startDate), desc(s.offers.id))]);
  const on = offersEnabled(st);
  const today = todayInRiyadh();
  const state = (o: OfferRow) =>
    !o.active ? (["موقوف", "bg-stone text-muted"] as const) : o.endDate < today ? (["انتهى", "bg-stone text-muted"] as const) : o.startDate > today ? (["قادم", "bg-sign-soft text-sign"] as const) : (["شغّال الآن", "bg-amber/20 text-amber-deep"] as const);

  return (
    <div className="space-y-6 max-w-5xl">
      <p className="text-muted max-w-[75ch]">
        العرض خصم بنسبة على الرحلات اللي تاريخها بين تاريخين. يبدأ وينتهي تلقائيًا، ويظهر للعميل في ملخص الحجز. إذا تداخل عرضان يُطبّق الأكبر.
      </p>

      {/* every offer on or off by hand */}
      <Card className={`p-5 flex flex-wrap items-center justify-between gap-4 ${on ? "" : "border-danger/30"}`} data-testid="offers-switch">
        <div>
          <p className="font-semibold">{on ? "العروض شغّالة" : "العروض موقوفة"}</p>
          <p className="text-sm text-muted">{on ? "العروض المفعّلة تُطبّق تلقائيًا في فتراتها." : "ما يُطبّق أي عرض لين تشغّلها."}</p>
        </div>
        <ActionForm
          action={setOffersEnabled}
          submitLabel={on ? "إيقاف كل العروض" : "تشغيل العروض"}
          submitClassName={on ? "btn btn-ghost border border-line" : "btn btn-primary"}
          className=""
        >
          <input type="hidden" name="on" value={on ? "0" : "1"} />
        </ActionForm>
      </Card>

      <Card className="p-6" data-testid="offer-add">
        <h2 className="font-semibold mb-4">إضافة عرض</h2>
        <ActionForm action={addOffer} submitLabel="إضافة العرض" key={rows.length}>
          <OfferFields />
        </ActionForm>
      </Card>

      {rows.length === 0 ? (
        <p className="text-muted">لا توجد عروض بعد.</p>
      ) : (
        <ul className="space-y-3" data-testid="offer-list">
          {rows.map((o) => {
            const [label, cls] = state(o);
            return (
              <li key={o.id} data-offer={o.id}>
                <Card className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-semibold">{o.nameAr}</p>
                    <span className="rounded-md bg-sign px-2 py-0.5 text-sm font-semibold text-white tabular">-{formatNumber(o.percent, "ar")}٪</span>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${cls}`} data-testid="offer-state">
                      {label}
                    </span>
                    <span className="text-sm text-muted">
                      من {formatDate(o.startDate, "ar")} إلى {formatDate(o.endDate, "ar")}
                    </span>
                    <span className="ms-auto flex gap-2">
                      <ActionForm
                        action={toggleOffer}
                        submitLabel={o.active ? "إيقاف" : "تفعيل"}
                        submitClassName="btn btn-ghost border border-line !min-h-8 !py-0.5 text-sm"
                        className=""
                      >
                        <input type="hidden" name="id" value={o.id} />
                        <input type="hidden" name="on" value={o.active ? "0" : "1"} />
                      </ActionForm>
                      <ActionForm action={deleteOffer} submitLabel="حذف" submitClassName="btn btn-ghost !min-h-8 !py-0.5 text-sm !text-danger" className="">
                        <input type="hidden" name="id" value={o.id} />
                      </ActionForm>
                    </span>
                  </div>
                  <details>
                    <summary className="cursor-pointer text-sm text-sign">تعديل</summary>
                    <ActionForm action={saveOffer} submitLabel="حفظ" className="mt-3 space-y-4">
                      <input type="hidden" name="id" value={o.id} />
                      <OfferFields o={o} />
                    </ActionForm>
                  </details>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function OfferFields({ o }: { o?: OfferRow }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Field label="اسم العرض">
        <input name="nameAr" required minLength={2} maxLength={80} defaultValue={o?.nameAr} placeholder="عرض اليوم الوطني" className="field" />
      </Field>
      <Field label="الاسم بالإنجليزي (اختياري)">
        <input name="nameEn" maxLength={80} defaultValue={o?.nameEn} dir="ltr" className="field text-start" />
      </Field>
      <Field label="نسبة الخصم ٪">
        <input name="percent" type="number" min={1} max={90} required defaultValue={o?.percent ?? 10} dir="ltr" className="field text-start" />
      </Field>
      <Field label="من تاريخ الرحلة">
        <input name="startDate" type="date" required defaultValue={o?.startDate} className="field" />
      </Field>
      <Field label="إلى تاريخ الرحلة">
        <input name="endDate" type="date" required defaultValue={o?.endDate} className="field" />
      </Field>
    </div>
  );
}
