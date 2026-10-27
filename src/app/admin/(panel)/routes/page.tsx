import Link from "next/link";
import { Suspense } from "react";
import { requireSection } from "@/lib/auth";
import { getRoutesAdmin } from "@/lib/admin-data";
import { saveRoute } from "../../actions";
import { routeTitle } from "@/lib/catalog";
import { formatNumber } from "@/lib/format";
import { ActionForm } from "@/components/admin/action-form";
import { Card, PageHeader, Skeleton } from "@/components/admin/ui";
import { RouteFields } from "@/components/admin/route-fields";

export default function RoutesAdminPage() {
  return (
    <>
      <PageHeader title="الرحلات بأسعار ثابتة" />
      <Suspense fallback={<Skeleton h="h-[600px]" />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requireSection("catalog");
  const { routes, locations, cities, counts } = await getRoutesAdmin();

  return (
    <div className="space-y-10">
      <section>
        <Card>
          <ul className="divide-y divide-line">
            {routes.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/routes/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-stone/60">
                  <span>
                    <span className="font-medium">{routeTitle(r, "ar")}</span>
                    <span className="block text-sm text-muted">
                      {r.kind === "ziyarat" ? "جولة" : r.bidirectional ? "الاتجاهين" : "اتجاه واحد"}
                      {r.distanceKm != null && ` · ${formatNumber(r.distanceKm, "ar")} كم`}
                      {` · ${formatNumber(counts.get(r.id) ?? 0, "ar")} سيارات مسعّرة`}
                    </span>
                  </span>
                  {!r.active && <span className="text-sm text-danger">مخفية</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">إضافة رحلة</h2>
        <Card className="p-6">
          <ActionForm action={saveRoute} submitLabel="إضافة الرحلة">
            <RouteFields locations={locations} cities={cities} />
          </ActionForm>
        </Card>
      </section>

      <p className="text-sm text-muted">
        الوجهات والمدن (المطارات، المعالم، الفنادق…) تُدار من{" "}
        <Link href="/admin/destinations" className="text-sign hover:underline">
          صفحة الوجهات والمدن
        </Link>
        . أي وجهتين بدون رحلة ثابتة تُسعَّر تلقائيًا حسب المسافة.
      </p>
    </div>
  );
}
