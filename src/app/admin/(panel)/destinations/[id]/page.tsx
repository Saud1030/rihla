import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { asc, eq, or } from "drizzle-orm";
import { requireSection } from "@/lib/auth";
import { db, schema as s } from "@/db";
import { deleteLocation, saveLocation } from "../../../actions";
import { routeTitle } from "@/lib/catalog";
import { ActionForm } from "@/components/admin/action-form";
import { Card, Skeleton } from "@/components/admin/ui";
import { LocationFields } from "@/components/admin/location-fields";

export default function DestinationEditPage({ params }: PageProps<"/admin/destinations/[id]">) {
  return (
    <>
      <Link href="/admin/destinations" className="text-sm text-muted hover:text-ink">
        → كل الوجهات
      </Link>
      <Suspense fallback={<Skeleton h="h-[500px]" />}>
        <Editor params={params} />
      </Suspense>
    </>
  );
}

async function Editor({ params }: { params: Promise<{ id: string }> }) {
  await requireSection("catalog");
  const { id } = await params;
  const lid = Number(id) || 0;
  const [l, cities, routes] = await Promise.all([
    db.query.locations.findFirst({ where: eq(s.locations.id, lid) }),
    db.select().from(s.cities).orderBy(asc(s.cities.sortOrder)),
    db.query.routes.findMany({
      where: or(eq(s.routes.fromLocationId, lid), eq(s.routes.toLocationId, lid)),
      with: { from: true, to: true },
    }),
  ]);
  if (!l) notFound();

  return (
    <div className="mt-3 max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{l.nameAr}</h1>
      <Card className="p-6">
        <ActionForm action={saveLocation} submitLabel="حفظ">
          <LocationFields cities={cities} l={l} />
        </ActionForm>
      </Card>

      {routes.length > 0 && (
        <Card className="p-6">
          <h2 className="font-semibold mb-2">رحلات ثابتة تستخدم هذه الوجهة</h2>
          <ul className="text-sm space-y-1">
            {routes.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/routes/${r.id}`} className="text-sign hover:underline">
                  {routeTitle(r, "ar")}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-6 border-danger/30">
        <h2 className="font-semibold">حذف الوجهة</h2>
        <p className="text-sm text-muted mt-1 mb-4">
          الحذف نهائي. الحجوزات السابقة تبقى كما هي. إذا أردت إيقافها مؤقتًا، ألغِ «ظاهرة للعملاء» بدلًا من الحذف.
        </p>
        <ActionForm action={deleteLocation} submitLabel="حذف الوجهة نهائيًا" pendingLabel="جارٍ الحذف…" submitClassName="btn !bg-danger !text-white">
          <input type="hidden" name="id" value={l.id} />
        </ActionForm>
      </Card>
    </div>
  );
}
