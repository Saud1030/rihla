import Link from "next/link";
import { Suspense } from "react";
import { requireSection } from "@/lib/auth";
import { asc } from "drizzle-orm";
import { db, schema as sc } from "@/db";
import { getPriceMatrix } from "@/lib/admin-data";
import { addPricedRoute, savePrices } from "../../actions";
import { LocationOptions } from "@/components/admin/route-fields";
import { Field } from "@/components/admin/ui";
import { routeTitle } from "@/lib/catalog";
import { ActionForm } from "@/components/admin/action-form";
import { Card, PageHeader, Skeleton } from "@/components/admin/ui";

export default function PricesPage({
  searchParams,
}: PageProps<"/admin/prices">) {
  return (
    <>
      <PageHeader title="الأسعار" />
      <p className="text-muted -mt-3 mb-5 max-w-[70ch]">
        سعر كل سيارة على كل رحلة بالريال،{" "}
        <strong>قبل ضريبة القيمة المضافة</strong>. اترك الخانة فارغة إذا كانت
        السيارة غير متاحة على هذه الرحلة. «قبل الخصم» اختياري ويظهر مشطوبًا
        بجانب السعر.
      </p>
      <Suspense fallback={<Skeleton h="h-[600px]" />}>
        <Matrix searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Matrix({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSection("catalog");
  const sp = await searchParams;
  const city = typeof sp.city === "string" ? sp.city : "";
  const added = typeof sp.added === "string" ? sp.added : "";
  const [{ routes: allRoutes, vehicles, byKey }, locations, cities] =
    await Promise.all([
      getPriceMatrix(),
      db
        .select()
        .from(sc.locations)
        .orderBy(asc(sc.locations.sortOrder), asc(sc.locations.id)),
      db
        .select()
        .from(sc.cities)
        .orderBy(asc(sc.cities.sortOrder), asc(sc.cities.id)),
    ]);
  const routes = city
    ? allRoutes.filter((r) => r.from?.city === city || r.to?.city === city)
    : allRoutes;
  const usedCities = cities.filter((c) =>
    allRoutes.some((r) => r.from?.city === c.slug || r.to?.city === c.slug),
  );
  const sar = (h: number | null | undefined) =>
    h == null ? "" : String(h / 100);

  return (
    <div className="space-y-6">
      {added && (
        <p
          role="status"
          className="rounded-lg bg-sign-soft border border-sign/20 px-4 py-3 text-sign"
        >
          تمت إضافة الرحلة بأسعارها، وتظهر للعملاء الآن. تقدر تعدّل أسعارها من
          الجدول.
        </p>
      )}
      <Card className="p-6" data-testid="add-priced-route">
        <h2 className="font-semibold">إضافة رحلة جديدة بسعرها</h2>
        <p className="text-sm text-muted mt-1 mb-4 max-w-[70ch]">
          اختر من أين وإلى أين، واكتب سعر كل سيارة بالريال قبل الضريبة. الخانة
          الفارغة تُحسب تلقائيًا من المسافة إذا فعّلت الخيار. وجهتك غير موجودة؟
          أضفها أولًا من{" "}
          <Link href="/admin/destinations" className="text-sign hover:underline">
            الوجهات والمدن
          </Link>
          .
        </p>
        <ActionForm
          action={addPricedRoute}
          submitLabel="إضافة الرحلة والأسعار"
          pendingLabel="جارٍ الإضافة…"
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="من">
              <select
                name="fromLocationId"
                required
                defaultValue=""
                className="field"
              >
                <option value="" disabled>
                  اختر الوجهة
                </option>
                <LocationOptions locations={locations} cities={cities} />
              </select>
            </Field>
            <Field label="إلى">
              <select
                name="toLocationId"
                required
                defaultValue=""
                className="field"
              >
                <option value="" disabled>
                  اختر الوجهة
                </option>
                <LocationOptions locations={locations} cities={cities} />
              </select>
            </Field>
            <Field
              label="المسافة بالكيلومتر (اختياري)"
              hint="تُحسب تلقائيًا من موقع الوجهتين إذا تُركت فارغة"
            >
              <input
                name="distanceKm"
                inputMode="numeric"
                className="field tabular"
                dir="ltr"
              />
            </Field>
          </div>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            {vehicles
              .filter((v) => v.active)
              .map((v) => (
                <Field key={v.id} label={v.nameAr}>
                  <input
                    name={`newprice_${v.id}`}
                    inputMode="decimal"
                    placeholder="تلقائي"
                    className="field tabular"
                    dir="ltr"
                  />
                </Field>
              ))}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="autoFill"
                defaultChecked
                className="size-4 accent-sign"
              />
              املأ الأسعار الفارغة حسب المسافة
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="bidirectional"
                defaultChecked
                className="size-4 accent-sign"
              />
              نفس السعر في الاتجاهين (ذهاب وعودة)
            </label>
          </div>
        </ActionForm>
      </Card>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <Field label="عرض رحلات مدينة">
          <select name="city" defaultValue={city} className="field min-w-56">
            <option value="">كل المدن ({allRoutes.length} رحلة)</option>
            {usedCities.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.nameAr}
              </option>
            ))}
          </select>
        </Field>
        <button type="submit" className="btn btn-ghost">
          عرض
        </button>
      </form>

      <ActionForm
        action={savePrices}
        submitLabel="حفظ كل الأسعار"
        className="space-y-4"
      >
        <Card className="relative overflow-x-auto">
          <table className="text-sm border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky start-0 z-10 bg-paper text-start font-medium px-4 py-3 border-b border-line min-w-56">
                  الرحلة
                </th>
                {vehicles.map((v) => (
                  <th
                    key={v.id}
                    className="text-start font-medium px-3 py-3 border-b border-line min-w-32"
                  >
                    {v.nameAr}
                    {!v.active && (
                      <span className="block text-xs text-danger font-normal">
                        غير مفعّلة
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => (
                <tr key={r.id} className={r.active ? "" : "opacity-60"}>
                  <th
                    scope="row"
                    className="sticky start-0 z-10 bg-paper text-start font-normal px-4 py-2 border-b border-line"
                  >
                    {routeTitle(r, "ar")}
                    {!r.active && (
                      <span className="block text-xs text-danger">مخفية</span>
                    )}
                  </th>
                  {vehicles.map((v) => {
                    const trip = byKey.get(`${r.id}_${v.id}`);
                    const offered = trip?.active;
                    return (
                      <td
                        key={v.id}
                        className="px-3 py-2 border-b border-line align-top"
                      >
                        <label
                          className="sr-only"
                          htmlFor={`price_${r.id}_${v.id}`}
                        >
                          سعر {v.nameAr} على {routeTitle(r, "ar")}
                        </label>
                        <input
                          id={`price_${r.id}_${v.id}`}
                          name={`price_${r.id}_${v.id}`}
                          defaultValue={offered ? sar(trip.price) : ""}
                          inputMode="decimal"
                          placeholder="—"
                          className="field !min-h-9 !py-1.5 tabular w-28"
                        />
                        <input
                          name={`was_${r.id}_${v.id}`}
                          defaultValue={offered ? sar(trip.compareAtPrice) : ""}
                          inputMode="decimal"
                          placeholder="قبل الخصم"
                          aria-label={`السعر قبل الخصم لـ ${v.nameAr} على ${routeTitle(r, "ar")}`}
                          className="field !min-h-8 !py-1 mt-1 text-xs text-muted tabular w-28"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </ActionForm>
    </div>
  );
}
