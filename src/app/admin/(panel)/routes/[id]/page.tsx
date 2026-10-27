import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requireSection } from "@/lib/auth";
import { db, schema as s } from "@/db";
import { saveRoute } from "../../../actions";
import { routeTitle } from "@/lib/catalog";
import { ActionForm } from "@/components/admin/action-form";
import { Card, Skeleton } from "@/components/admin/ui";
import { RouteFields } from "@/components/admin/route-fields";

export default function RouteEditPage({ params }: PageProps<"/admin/routes/[id]">) {
  return (
    <>
      <Link href="/admin/routes" className="text-sm text-muted hover:text-ink">
        → كل الرحلات
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
  const [r, locations, cities] = await Promise.all([
    db.query.routes.findFirst({ where: eq(s.routes.id, Number(id) || 0), with: { from: true, to: true } }),
    db.select().from(s.locations).orderBy(asc(s.locations.sortOrder)),
    db.select().from(s.cities).orderBy(asc(s.cities.sortOrder)),
  ]);
  if (!r) notFound();
  return (
    <div className="mt-3 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">{routeTitle(r, "ar")}</h1>
      <Card className="p-6">
        <ActionForm action={saveRoute} submitLabel="حفظ">
          <RouteFields locations={locations} cities={cities} r={r} />
        </ActionForm>
      </Card>
      <p className="text-sm text-muted mt-4">
        الأسعار تُعدّل من{" "}
        <Link href="/admin/prices" className="text-sign hover:underline">
          صفحة الأسعار
        </Link>
        .
      </p>
    </div>
  );
}
