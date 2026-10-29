import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { requireSection } from "@/lib/auth";
import { db, schema as s } from "@/db";
import { addCity, bulkLocations, saveLocation, toggleCity } from "../../actions";
import { DestinationsTable } from "@/components/admin/destinations-table";
import { KIND_LABELS, LOCATION_KINDS, type LocationKind } from "@/lib/regions";
import { formatNumber } from "@/lib/format";
import { fold } from "@/lib/text";
import { ActionForm } from "@/components/admin/action-form";
import { Card, Field, PageHeader, Skeleton } from "@/components/admin/ui";
import { LocationFields } from "@/components/admin/location-fields";

export const metadata: Metadata = { title: "الوجهات والمدن" };

export default function DestinationsPage({ searchParams }: PageProps<"/admin/destinations">) {
  return (
    <>
      <PageHeader title="الوجهات والمدن" />
      <p className="text-muted -mt-3 mb-6 max-w-[75ch]">
        كل وجهة هنا تظهر للعملاء في البحث. أي وجهتين ليس بينهما رحلة بسعر ثابت تُسعَّر تلقائيًا حسب المسافة وأسعار كل سيارة.
      </p>
      <Suspense fallback={<Skeleton h="h-[700px]" />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection("catalog");
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const [cities, locations] = await Promise.all([
    db.select().from(s.cities).orderBy(asc(s.cities.sortOrder), asc(s.cities.id)),
    db.select().from(s.locations).orderBy(asc(s.locations.sortOrder), asc(s.locations.id)),
  ]);

  const city = cities.find((c) => c.slug === one("city"))?.slug ?? "";
  const kind = (LOCATION_KINDS as readonly string[]).includes(one("kind")) ? (one("kind") as LocationKind) : "";
  const q = one("q").slice(0, 60);
  const visibility = one("show") === "hidden" || one("show") === "visible" ? one("show") : "";
  const cityBySlug = new Map(cities.map((c) => [c.slug, c]));

  const filtered = locations.filter((l) => {
    const c = cityBySlug.get(l.city);
    if (city && l.city !== city) return false;
    if (kind && l.kind !== kind) return false;
    if (visibility === "hidden" && l.active) return false;
    if (visibility === "visible" && !l.active) return false;
    if (q) {
      const hay = fold(`${l.nameAr} ${l.nameEn} ${c?.nameAr ?? ""} ${c?.nameEn ?? ""}`);
      if (!fold(q).split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });

  const counts = new Map<string, number>();
  for (const l of locations) counts.set(l.city, (counts.get(l.city) ?? 0) + 1);

  return (
    <div className="space-y-8">
      {(one("added") || one("deleted")) && (
        <p className="text-sm text-sign bg-sign-soft rounded-md px-4 py-2" role="status">
          {one("added") ? "تمت إضافة الوجهة." : "تم حذف الوجهة."}
        </p>
      )}

      {/* Filters */}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <Field label="بحث" className="grow min-w-48">
          <input name="q" defaultValue={q} placeholder="اسم الوجهة أو المدينة" className="field" />
        </Field>
        <Field label="المدينة">
          <select name="city" defaultValue={city} className="field">
            <option value="">كل المدن</option>
            {cities.map((c) => (
              <option key={c.slug} value={c.slug}>
                مدينة {c.nameAr}
              </option>
            ))}
          </select>
        </Field>
        <Field label="النوع">
          <select name="kind" defaultValue={kind} className="field">
            <option value="">كل الأنواع</option>
            {LOCATION_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k].ar}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الحالة">
          <select name="show" defaultValue={visibility} className="field">
            <option value="">الكل</option>
            <option value="visible">الظاهرة فقط</option>
            <option value="hidden">المخفية فقط</option>
          </select>
        </Field>
        <button className="btn btn-primary">تصفية</button>
        {(q || city || kind || visibility) && (
          <Link href="/admin/destinations" className="btn btn-ghost">
            مسح
          </Link>
        )}
      </form>

      {/* List */}
      <section>
        <p className="text-sm text-muted tabular mb-2">
          {formatNumber(filtered.length, "ar")} وجهة من {formatNumber(locations.length, "ar")}
        </p>
        <DestinationsTable
          action={bulkLocations}
          rows={filtered.map((l) => {
            const c = cityBySlug.get(l.city);
            return {
              id: l.id,
              nameAr: l.nameAr,
              nameEn: l.nameEn,
              kind: KIND_LABELS[l.kind].ar,
              city: c?.nameAr ?? l.city,
              active: l.active,
              noCoords: l.lat == null,
            };
          })}
        />
      </section>

      {/* Add destination */}
      <section id="add">
        <h2 className="text-lg font-semibold mb-3">إضافة وجهة جديدة</h2>
        <Card className="p-6">
          <ActionForm action={saveLocation} submitLabel="إضافة الوجهة">
            <LocationFields cities={cities} defaultCity={city || undefined} />
          </ActionForm>
        </Card>
      </section>

      {/* Cities */}
      <section id="cities" className="space-y-4">
        <h2 className="text-lg font-semibold">المدن</h2>
        <Card>
          <ul className="divide-y divide-line text-sm">
            {cities.map((c) => (
              <li key={c.slug} className="flex items-center justify-between gap-3 px-4 py-2">
                <Link href={`/admin/destinations?city=${c.slug}`} className={c.active ? "hover:text-sign" : "text-muted line-through"}>
                  مدينة {c.nameAr}
                  <span className="text-muted tabular"> · {formatNumber(counts.get(c.slug) ?? 0, "ar")} وجهة</span>
                </Link>
                <ActionForm action={toggleCity} submitLabel={c.active ? "إخفاء" : "إظهار"} className="flex items-center gap-2" submitClassName="text-xs text-sign hover:underline">
                  <input type="hidden" name="slug" value={c.slug} />
                  <input type="hidden" name="active" value={c.active ? "0" : "1"} />
                </ActionForm>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold mb-4">إضافة مدينة</h3>
          <ActionForm action={addCity} submitLabel="إضافة المدينة">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="اسم المدينة بالعربي">
                <input name="nameAr" required maxLength={80} className="field" />
              </Field>
              <Field label="اسم المدينة بالإنجليزي">
                <input name="nameEn" required maxLength={80} dir="ltr" className="field text-start" />
              </Field>
              <Field label="موقع المدينة" hint="رابط خرائط جوجل لوسط المدينة، أو الإحداثيات">
                <input name="coords" required dir="ltr" maxLength={2000} placeholder="24.7136, 46.6753" className="field text-start" />
              </Field>
              <label className="flex items-center gap-2 sm:col-span-2">
                <input type="checkbox" name="addStop" defaultChecked className="size-4 accent-sign" />
                <span>أضف وجهة «داخل المدينة» تلقائيًا حتى يمكن الحجز إليها مباشرة</span>
              </label>
            </div>
          </ActionForm>
        </Card>
      </section>
    </div>
  );
}
