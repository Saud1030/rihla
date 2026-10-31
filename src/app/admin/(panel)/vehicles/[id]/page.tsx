import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireSection } from "@/lib/auth";
import { db, schema as s } from "@/db";
import { saveVehicle } from "../../../actions";
import { getDictionary } from "@/i18n/dictionaries";
import { formatSAR } from "@/lib/format";
import { distancePrice } from "@/lib/pricing";
import { ActionForm } from "@/components/admin/action-form";
import { Card, Field, Skeleton } from "@/components/admin/ui";
import { VehicleImageField } from "@/components/admin/vehicle-image-field";

const t = getDictionary("ar");

export default function VehicleEditPage({
  params,
}: PageProps<"/admin/vehicles/[id]">) {
  return (
    <>
      <Link
        href="/admin/vehicles"
        className="text-sm text-muted hover:text-ink"
      >
        → كل السيارات
      </Link>
      <Suspense fallback={<Skeleton h="h-[600px]" />}>
        <Editor params={params} />
      </Suspense>
    </>
  );
}

async function Editor({ params }: { params: Promise<{ id: string }> }) {
  await requireSection("catalog");
  const { id } = await params;
  const isNew = id === "new";
  const v = isNew
    ? null
    : await db.query.vehicles.findFirst({
        where: eq(s.vehicles.id, Number(id) || 0),
      });
  if (!isNew && !v) notFound();

  return (
    <div className="mt-3 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">
        {isNew ? "إضافة سيارة" : v!.nameAr}
      </h1>
      <Card className="p-6">
        <ActionForm action={saveVehicle} submitLabel={isNew ? "إضافة" : "حفظ"}>
          {v && <input type="hidden" name="id" value={v.id} />}
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="الاسم بالعربي">
              <input
                name="nameAr"
                required
                defaultValue={v?.nameAr}
                className="field"
              />
            </Field>
            <Field label="الاسم بالإنجليزي">
              <input
                name="nameEn"
                required
                defaultValue={v?.nameEn}
                dir="ltr"
                className="field text-start"
              />
            </Field>
            <Field
              label="الرمز (بالإنجليزي)"
              hint="حروف صغيرة وأرقام وشرطات، مثل toyota-camry"
            >
              <input
                name="slug"
                required
                defaultValue={v?.slug}
                dir="ltr"
                pattern="[a-z0-9\-]{2,60}"
                className="field text-start"
              />
            </Field>
            <Field label="الفئة">
              <select
                name="category"
                defaultValue={v?.category ?? "sedan"}
                className="field"
              >
                {s.vehicleCategory.enumValues.map((c) => (
                  <option key={c} value={c}>
                    {t.fleet.category[c]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="عدد الركاب">
              <input
                name="passengers"
                type="number"
                min={1}
                required
                defaultValue={v?.passengers ?? 4}
                className="field tabular"
              />
            </Field>
            <Field label="عدد الحقائب">
              <input
                name="bags"
                type="number"
                min={0}
                required
                defaultValue={v?.bags ?? 3}
                className="field tabular"
              />
            </Field>
            <Field label="صورة السيارة" className="sm:col-span-2">
              <VehicleImageField current={v?.imageUrl ?? null} fallback={`/vehicles/${v?.category ?? "sedan"}.svg`} />
            </Field>
            <Field label="المميزات بالعربي" hint="ميزة في كل سطر">
              <textarea
                name="featuresAr"
                rows={4}
                defaultValue={v?.features.map((f) => f.ar).join("\n")}
                className="field"
              />
            </Field>
            <Field label="المميزات بالإنجليزي" hint="بنفس ترتيب العربي">
              <textarea
                name="featuresEn"
                rows={4}
                defaultValue={v?.features.map((f) => f.en).join("\n")}
                dir="ltr"
                className="field text-start"
              />
            </Field>
            <fieldset className="sm:col-span-2 rounded-lg border border-line p-4 space-y-3">
              <legend className="px-1 text-sm font-medium">
                التسعير حسب المسافة (بالريال، قبل الضريبة)
              </legend>
              <p className="text-xs text-muted">
                يُستخدم لأي رحلة بين وجهتين ليس بينهما سعر ثابت: السعر = رسوم
                البداية + (سعر الكيلومتر × المسافة)، ولا يقل عن الحد الأدنى،
                ويُقرَّب لأعلى ٥ ريال.
              </p>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="رسوم البداية">
                  <input
                    name="baseFare"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    defaultValue={(v?.baseFare ?? 6000) / 100}
                    className="field tabular"
                  />
                </Field>
                <Field label="سعر الكيلومتر">
                  <input
                    name="perKm"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    defaultValue={(v?.perKm ?? 120) / 100}
                    className="field tabular"
                  />
                </Field>
                <Field label="الحد الأدنى للرحلة">
                  <input
                    name="minFare"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    defaultValue={(v?.minFare ?? 10000) / 100}
                    className="field tabular"
                  />
                </Field>
              </div>
              {v && (
                <p className="text-xs text-muted tabular">
                  مثال: ١٠٠ كم = {formatSAR(distancePrice(v, 100), "ar")}، ٤٠٠
                  كم = {formatSAR(distancePrice(v, 400), "ar")}
                </p>
              )}
            </fieldset>
            <fieldset className="sm:col-span-2 rounded-lg border border-line p-4 space-y-3">
              <legend className="px-1 text-sm font-medium">الحجز بالساعة مع سائق (بالريال، قبل الضريبة)</legend>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="١٠ ساعات">
                  <input name="hourly10" type="number" min={0} step="0.01" required defaultValue={(v?.hourly10 ?? 55000) / 100} className="field tabular" />
                </Field>
                <Field label="١٢ ساعة">
                  <input name="hourly12" type="number" min={0} step="0.01" required defaultValue={(v?.hourly12 ?? 60000) / 100} className="field tabular" />
                </Field>
                <Field label="٢٤ ساعة">
                  <input name="hourly24" type="number" min={0} step="0.01" required defaultValue={(v?.hourly24 ?? 100000) / 100} className="field tabular" />
                </Field>
              </div>
            </fieldset>
            <Field label="الترتيب" hint="الأصغر يظهر أولًا">
              <input
                name="sortOrder"
                type="number"
                defaultValue={v?.sortOrder ?? 0}
                className="field tabular"
              />
            </Field>
            <label className="flex items-center gap-2 self-center pt-5">
              <input
                type="checkbox"
                name="active"
                defaultChecked={v?.active ?? true}
                className="size-4 accent-sign"
              />
              <span>مفعّلة وتظهر للعملاء</span>
            </label>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
