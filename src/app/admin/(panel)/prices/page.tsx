import { Suspense } from "react";
import { requireSection } from "@/lib/auth";
import { getPriceMatrix } from "@/lib/admin-data";
import { savePrices } from "../../actions";
import { routeTitle } from "@/lib/catalog";
import { ActionForm } from "@/components/admin/action-form";
import { Card, PageHeader, Skeleton } from "@/components/admin/ui";

export default function PricesPage() {
  return (
    <>
      <PageHeader title="الأسعار" />
      <p className="text-muted -mt-3 mb-5 max-w-[70ch]">
        سعر كل سيارة على كل رحلة بالريال، <strong>قبل ضريبة القيمة المضافة</strong>. اترك الخانة فارغة إذا كانت السيارة غير متاحة على هذه الرحلة. «قبل الخصم» اختياري ويظهر مشطوبًا
        بجانب السعر.
      </p>
      <Suspense fallback={<Skeleton h="h-[600px]" />}>
        <Matrix />
      </Suspense>
    </>
  );
}

async function Matrix() {
  await requireSection("catalog");
  const { routes, vehicles, byKey } = await getPriceMatrix();
  const sar = (h: number | null | undefined) => (h == null ? "" : String(h / 100));

  return (
    <ActionForm action={savePrices} submitLabel="حفظ كل الأسعار" className="space-y-4">
      <Card className="relative overflow-x-auto">
        <table className="text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky start-0 z-10 bg-paper text-start font-medium px-4 py-3 border-b border-line min-w-56">الرحلة</th>
              {vehicles.map((v) => (
                <th key={v.id} className="text-start font-medium px-3 py-3 border-b border-line min-w-32">
                  {v.nameAr}
                  {!v.active && <span className="block text-xs text-danger font-normal">غير مفعّلة</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => (
              <tr key={r.id} className={r.active ? "" : "opacity-60"}>
                <th scope="row" className="sticky start-0 z-10 bg-paper text-start font-normal px-4 py-2 border-b border-line">
                  {routeTitle(r, "ar")}
                  {!r.active && <span className="block text-xs text-danger">مخفية</span>}
                </th>
                {vehicles.map((v) => {
                  const trip = byKey.get(`${r.id}_${v.id}`);
                  const offered = trip?.active;
                  return (
                    <td key={v.id} className="px-3 py-2 border-b border-line align-top">
                      <label className="sr-only" htmlFor={`price_${r.id}_${v.id}`}>
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
  );
}
