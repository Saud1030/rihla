import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { HOUR_PACKAGES, hourlyPrice } from "@/lib/policy";
import { saveCityHourlyPrices } from "../../actions";
import { ActionForm } from "@/components/admin/action-form";
import { Card, PageHeader, Skeleton } from "@/components/admin/ui";

export default function HourlyPricesPage() {
  return (
    <>
      <PageHeader title="أسعار الساعات بالمدن" />
      <Suspense fallback={<Skeleton h="h-96" />}>
        <Prices />
      </Suspense>
    </>
  );
}

/** Car with a driver by the hour: a price per city, car and package (10 / 12 / 24 hours), before VAT */
async function Prices() {
  await requireSection("catalog");
  const [cities, vehicles, rows] = await Promise.all([
    db.select().from(s.cities).where(eq(s.cities.active, true)).orderBy(asc(s.cities.sortOrder), asc(s.cities.id)),
    db.select().from(s.vehicles).where(eq(s.vehicles.active, true)).orderBy(asc(s.vehicles.sortOrder)),
    db.select().from(s.cityHourlyPrices),
  ]);
  const price = (city: string, vehicleId: number, hours: number) => rows.find((r) => r.city === city && r.vehicleId === vehicleId && r.hours === hours)?.price;

  return (
    <div className="space-y-6 max-w-5xl">
      <p className="text-muted max-w-[75ch]">
        هذه أسعار «سيارة مع سائق بالساعة» في كل مدينة، قبل الضريبة. العميل يختار المدينة والمدة فقط. الخانة الفارغة تأخذ سعر السيارة العام من صفحة السيارات (يظهر بالرمادي).
      </p>
      {cities.map((c) => (
        <Card key={c.slug} className="p-5" data-testid={`city-hourly-${c.slug}`}>
          <h2 className="font-semibold mb-3">مدينة {c.nameAr}</h2>
          <ActionForm action={saveCityHourlyPrices} submitLabel={`حفظ أسعار ${c.nameAr}`}>
            <input type="hidden" name="city" value={c.slug} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted">
                  <tr>
                    <th className="text-start font-medium py-2 pe-3">السيارة</th>
                    {HOUR_PACKAGES.map((h) => (
                      <th key={h} className="text-start font-medium py-2 px-2 whitespace-nowrap">
                        {h} ساعات (ر.س)
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {vehicles.map((v) => (
                    <tr key={v.id}>
                      <td className="py-2 pe-3 whitespace-nowrap">{v.nameAr}</td>
                      {HOUR_PACKAGES.map((h) => {
                        const p = price(c.slug, v.id, h);
                        return (
                          <td key={h} className="py-2 px-2">
                            <input
                              name={`p_${v.id}_${h}`}
                              inputMode="decimal"
                              defaultValue={p != null ? p / 100 : ""}
                              placeholder={String(hourlyPrice(v, h) / 100)}
                              aria-label={`${c.nameAr} · ${v.nameAr} · ${h} ساعات`}
                              dir="ltr"
                              className="field !min-h-9 !py-1 tabular text-start max-w-32"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ActionForm>
        </Card>
      ))}
    </div>
  );
}
