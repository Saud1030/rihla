import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { requireSection } from "@/lib/auth";
import { db, schema as s } from "@/db";
import { getDictionary } from "@/i18n/dictionaries";
import { formatNumber } from "@/lib/format";
import { Card, PageHeader, Skeleton } from "@/components/admin/ui";

const t = getDictionary("ar");

export default function VehiclesPage() {
  return (
    <>
      <PageHeader
        title="السيارات"
        action={
          <Link href="/admin/vehicles/new" className="btn btn-primary">
            إضافة سيارة
          </Link>
        }
      />
      <Suspense fallback={<Skeleton />}>
        <List />
      </Suspense>
    </>
  );
}

async function List() {
  await requireSection("catalog");
  const vehicles = await db.select().from(s.vehicles).orderBy(asc(s.vehicles.sortOrder), asc(s.vehicles.id));
  return (
    <Card>
      <ul className="divide-y divide-line">
        {vehicles.map((v) => (
          <li key={v.id}>
            <Link href={`/admin/vehicles/${v.id}`} className="grid grid-cols-[80px_1fr_auto] items-center gap-4 px-5 py-3 hover:bg-stone/60">
              <Image src={v.imageUrl ?? `/vehicles/${v.category}.svg`} alt="" width={80} height={34} className="w-20 h-auto -scale-x-100" unoptimized />
              <span>
                <span className="font-medium">{v.nameAr}</span>
                <span className="text-muted"> · {v.nameEn}</span>
                <span className="block text-sm text-muted">
                  {t.fleet.category[v.category]} · {formatNumber(v.passengers, "ar")} ركاب · {formatNumber(v.bags, "ar")} حقائب
                </span>
              </span>
              {!v.active && <span className="text-sm text-danger">غير مفعّلة</span>}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
