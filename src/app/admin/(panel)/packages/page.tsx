import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { getSettings } from "@/lib/catalog";
import { parseVatConfig, withVat } from "@/lib/pricing";
import { MAX_INSTALLMENTS, dueSummary, splitAmount } from "@/lib/packages";
import { formatNumber, formatSAR } from "@/lib/format";
import { addPackage, deletePackage, savePackage, togglePackage } from "../../package-actions";
import { ActionForm } from "@/components/admin/action-form";
import { Card, Field, PageHeader, Skeleton } from "@/components/admin/ui";
import type { PackageRow } from "@/db/schema";

export default function PackagesAdminPage() {
  return (
    <>
      <PageHeader title="الباقات" />
      <Suspense fallback={<Skeleton h="h-96" />}>
        <Packages />
      </Suspense>
    </>
  );
}

type VehicleOption = { id: number; name: string };

async function Packages() {
  await requireSection("catalog");
  const [rows, vehicles, st] = await Promise.all([
    db.select().from(s.packages).orderBy(asc(s.packages.sortOrder), asc(s.packages.id)),
    db.select({ id: s.vehicles.id, name: s.vehicles.nameAr }).from(s.vehicles).orderBy(asc(s.vehicles.sortOrder)),
    getSettings(),
  ]);
  const rate = parseVatConfig(st).rateBp;

  return (
    <div className="space-y-6 max-w-5xl">
      <p className="text-muted max-w-[75ch]">
        الباقة عرض جاهز بسعر ثابت (مثل باقة عمرة أو باقة أيام بسيارة مع سائق). تظهر للعملاء في صفحة «الباقات» وزرها جنب «احجز الآن». تحدد عدد الدفعات: العميل يدفع الأولى وقت الحجز،
        والباقي ترسل له رابطه من صفحة الحجز متى ما تبي.
      </p>
      <Card className="p-6" data-testid="package-add">
        <h2 className="font-semibold mb-4">إضافة باقة</h2>
        <ActionForm action={addPackage} submitLabel="إضافة الباقة">
          <PackageFields vehicles={vehicles} />
        </ActionForm>
      </Card>

      {rows.length === 0 ? (
        <p className="text-muted">لا توجد باقات بعد.</p>
      ) : (
        <ul className="space-y-3" data-testid="package-admin-list">
          {rows.map((p) => {
            const total = withVat(p.price, rate).total;
            const parts = splitAmount(total, p.installments);
            return (
              <li key={p.id} data-package={p.id}>
                <Card className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-semibold">{p.nameAr}</p>
                    <span className="text-sm tabular">{formatSAR(total, "ar")} شامل الضريبة</span>
                    <span className="rounded-md bg-sign-soft text-sign px-2 py-0.5 text-xs font-medium">
                      {p.installments > 1 ? `${formatNumber(p.installments, "ar")} دفعات · ${formatSAR(parts[0], "ar")}${p.afterTrip > 0 ? ` · ${dueSummary(p.installments, p.afterTrip, "ar")}` : " · كلها قبل الرحلة"}` : "دفعة واحدة"}
                    </span>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${p.active ? "bg-amber/20 text-amber-deep" : "bg-stone text-muted"}`}>{p.active ? "ظاهرة" : "مخفية"}</span>
                    <span className="ms-auto flex gap-2">
                      <ActionForm action={togglePackage} submitLabel={p.active ? "إخفاء" : "إظهار"} submitClassName="btn btn-ghost border border-line !min-h-8 !py-0.5 text-sm" className="">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="on" value={p.active ? "0" : "1"} />
                      </ActionForm>
                      <ActionForm action={deletePackage} submitLabel="حذف" submitClassName="btn btn-ghost !min-h-8 !py-0.5 text-sm !text-danger" className="">
                        <input type="hidden" name="id" value={p.id} />
                      </ActionForm>
                    </span>
                  </div>
                  <details>
                    <summary className="cursor-pointer text-sm text-sign">تعديل</summary>
                    <ActionForm action={savePackage} submitLabel="حفظ" className="mt-3 space-y-4">
                      <input type="hidden" name="id" value={p.id} />
                      <PackageFields p={p} vehicles={vehicles} />
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

function PackageFields({ p, vehicles }: { p?: PackageRow; vehicles: VehicleOption[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="اسم الباقة">
        <input name="nameAr" required minLength={2} maxLength={100} defaultValue={p?.nameAr} placeholder="باقة العمرة ٣ أيام" className="field" />
      </Field>
      <Field label="الاسم بالإنجليزي (اختياري)">
        <input name="nameEn" maxLength={100} defaultValue={p?.nameEn} dir="ltr" className="field text-start" />
      </Field>
      <Field label="السعر قبل الضريبة (ر.س)">
        <input name="price" required inputMode="decimal" defaultValue={p ? String(p.price / 100) : ""} dir="ltr" className="field text-start" placeholder="1500" />
      </Field>
      <Field label="عدد الدفعات" hint="١ = دفعة واحدة؛ ٢ أو أكثر = على دفعات">
        <input name="installments" type="number" min={1} max={MAX_INSTALLMENTS} required defaultValue={p?.installments ?? 2} dir="ltr" className="field text-start" />
      </Field>
      <Field label="منها بعد الرحلة" hint="٠ = كل الدفعات قبل الرحلة. الأولى دائمًا وقت الحجز، ودفعات ما بعد الرحلة يوصل رابطها للعميل تلقائيًا لما تنتهي الرحلة">
        <input name="afterTrip" type="number" min={0} max={MAX_INSTALLMENTS - 1} defaultValue={p?.afterTrip ?? 0} dir="ltr" className="field text-start" />
      </Field>
      <Field label="السيارة (اختياري)">
        <select name="vehicleId" defaultValue={p?.vehicleId ?? ""} className="field">
          <option value="">بدون</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="أقصى عدد ركاب">
        <input name="passengers" type="number" min={1} max={100} required defaultValue={p?.passengers ?? 4} dir="ltr" className="field text-start" />
      </Field>
      <Field label="تفاصيل الباقة (كل سطر نقطة)" className="sm:col-span-2 lg:col-span-3">
        <textarea name="detailsAr" rows={4} maxLength={2000} defaultValue={p?.detailsAr} className="field" placeholder={"استقبال من المطار\nتنقلات داخل مكة ٣ أيام\nزيارة المدينة"} />
      </Field>
      <Field label="التفاصيل بالإنجليزي (اختياري)" className="sm:col-span-2 lg:col-span-2">
        <textarea name="detailsEn" rows={3} maxLength={2000} defaultValue={p?.detailsEn} dir="ltr" className="field text-start" />
      </Field>
      <Field label="الترتيب">
        <input name="sortOrder" type="number" defaultValue={p?.sortOrder ?? 0} dir="ltr" className="field text-start" />
      </Field>
    </div>
  );
}
