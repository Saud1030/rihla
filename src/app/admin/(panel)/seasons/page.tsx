import { Suspense } from "react";
import { requireSection } from "@/lib/auth";
import { getSettings } from "@/lib/catalog";
import { todayInRiyadh } from "@/lib/booking";
import { formatDate, formatNumber } from "@/lib/format";
import { HIJRI_MONTHS, inSeason, nextSeasonDates } from "@/lib/price-rules";
import { seasonsFrom } from "@/lib/price-rules-server";
import { saveSeason } from "../../price-rule-actions";
import { ActionForm } from "@/components/admin/action-form";
import { Card, Field, PageHeader, Skeleton } from "@/components/admin/ui";

export default function SeasonsPage() {
  return (
    <>
      <PageHeader title="الحج والعمرة" />
      <Suspense fallback={<Skeleton h="h-96" />}>
        <Seasons />
      </Suspense>
    </>
  );
}

const DAYS = Array.from({ length: 30 }, (_, i) => i + 1);

async function Seasons() {
  await requireSection("catalog");
  const seasons = seasonsFrom(await getSettings());
  const today = todayInRiyadh();

  return (
    <div className="space-y-6 max-w-4xl">
      <p className="text-muted max-w-[75ch]">
        في مواسم رمضان والعمرة والحج ترتفع الأسعار تلقائيًا بالنسبة اللي تحددها هنا، لكل الرحلات والسيارات اللي تاريخها داخل الموسم. التواريخ بالهجري (تقويم أم القرى)، فتتغير
        بالميلادي كل سنة لحالها بدون ما تعدّل شي. النسبة ٠ تعني بدون زيادة.
      </p>
      {seasons.map((se) => {
        const next = nextSeasonDates(se, today);
        const now = inSeason(today, se);
        return (
          <Card key={se.key} className="p-6 space-y-4" data-testid={`season-${se.key}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold text-lg">{se.name.ar}</h2>
              <span
                className={`rounded-md px-2 py-0.5 text-xs font-medium ${!se.enabled || se.percent === 0 ? "bg-stone text-muted" : now ? "bg-amber/20 text-amber-deep" : "bg-sign-soft text-sign"}`}
                data-testid="season-state"
              >
                {!se.enabled ? "موقوف" : se.percent === 0 ? "بدون زيادة" : now ? `شغّال الآن · +${formatNumber(se.percent, "ar")}٪` : `+${formatNumber(se.percent, "ar")}٪`}
              </span>
            </div>
            <p className="text-sm">
              من {formatNumber(se.from[1], "ar")} {HIJRI_MONTHS.ar[se.from[0] - 1]} إلى {formatNumber(se.to[1], "ar")} {HIJRI_MONTHS.ar[se.to[0] - 1]}
              {next && (
                <span className="text-muted" data-testid="season-dates">
                  {" "}
                  · {now ? "الموسم الحالي" : "الموسم القادم"}: من {formatDate(next.from, "ar")} إلى {formatDate(next.to, "ar")}
                </span>
              )}
            </p>
            <ActionForm action={saveSeason} submitLabel="حفظ">
              <input type="hidden" name="key" value={se.key} />
              <label className="flex items-center gap-2">
                <input type="checkbox" name="enabled" defaultChecked={se.enabled} className="size-4 accent-sign" />
                تفعيل زيادة هذا الموسم
              </label>
              <div className="grid gap-4 lg:grid-cols-[10rem_1fr_1fr]">
                <Field label="نسبة الزيادة ٪" hint="على سعر الرحلة قبل الضريبة">
                  <input name="percent" type="number" min={0} max={300} required defaultValue={se.percent} dir="ltr" className="field text-start" />
                </Field>
                <fieldset>
                  <legend className="block text-sm font-medium mb-1">من (هجري)</legend>
                  <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
                    <select name="fromDay" defaultValue={se.from[1]} className="field" aria-label="اليوم">
                      {DAYS.map((d) => (
                        <option key={d} value={d}>
                          {formatNumber(d, "ar")}
                        </option>
                      ))}
                    </select>
                    <select name="fromMonth" defaultValue={se.from[0]} className="field" aria-label="الشهر">
                      {HIJRI_MONTHS.ar.map((m, i) => (
                        <option key={m} value={i + 1}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="block text-sm font-medium mb-1">إلى (هجري)</legend>
                  <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
                    <select name="toDay" defaultValue={se.to[1]} className="field" aria-label="اليوم">
                      {DAYS.map((d) => (
                        <option key={d} value={d}>
                          {formatNumber(d, "ar")}
                        </option>
                      ))}
                    </select>
                    <select name="toMonth" defaultValue={se.to[0]} className="field" aria-label="الشهر">
                      {HIJRI_MONTHS.ar.map((m, i) => (
                        <option key={m} value={i + 1}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </fieldset>
              </div>
            </ActionForm>
          </Card>
        );
      })}
    </div>
  );
}
