import Link from "next/link";
import { Suspense } from "react";
import { asc, desc, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { driverRatings } from "@/lib/ratings";
import { formatNumber } from "@/lib/format";
import { deleteDriver, removeDriverPhoto, saveDriver } from "../../driver-actions";
import { ActionForm } from "@/components/admin/action-form";
import { Card, Field, PageHeader, Skeleton } from "@/components/admin/ui";
import { Stars } from "@/components/site/stars";
import { DriverPhoto } from "@/components/admin/driver-photo";
import { WhatsAppIcon } from "@/components/icons";
import { waLink } from "@/components/site/whatsapp-fab";

type Row = { id: number; name: string; phone: string; plateNumber: string; carType: string; carModel: string; carColor: string; notes: string; active: boolean; hasPhoto: boolean; updatedAt: Date };

export default function DriversPage({ searchParams }: PageProps<"/admin/drivers">) {
  return (
    <>
      <PageHeader title="السائقين" />
      <Suspense fallback={<Skeleton h="h-96" />}>
        <Drivers searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Drivers({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection("drivers");
  const sp = await searchParams;
  const [rows, ratings, trips] = await Promise.all([
    db
      .select({
        id: s.drivers.id,
        name: s.drivers.name,
        phone: s.drivers.phone,
        plateNumber: s.drivers.plateNumber,
        carType: s.drivers.carType,
        carModel: s.drivers.carModel,
        carColor: s.drivers.carColor,
        notes: s.drivers.notes,
        active: s.drivers.active,
        hasPhoto: sql<boolean>`${s.drivers.photo} is not null`,
        updatedAt: s.drivers.updatedAt,
      })
      .from(s.drivers)
      .orderBy(desc(s.drivers.active), asc(s.drivers.name)),
    driverRatings(),
    db
      .select({ driverId: s.bookings.driverId, done: sql<number>`count(*) filter (where ${s.bookings.status} = 'completed')::int`, upcoming: sql<number>`count(*) filter (where ${s.bookings.status} = 'confirmed')::int` })
      .from(s.bookings)
      .where(sql`${s.bookings.driverId} is not null`)
      .groupBy(s.bookings.driverId),
  ]);
  const tripCount = new Map(trips.map((t) => [t.driverId!, t]));

  return (
    <div className="space-y-6 max-w-4xl">
      <p className="text-muted max-w-[70ch]">
        سجّل سائقيك هنا، ثم اختر السائق من صفحة أي حجز مدفوع: تصل للسائق بيانات العميل، وتصل للعميل بيانات السائق وصورته على واتساب تلقائيًا. هذا القسم داخل لوحة التحكم فقط ولا يظهر في الموقع.
      </p>
      {(sp.added || sp.deleted) && (
        <p role="status" className="rounded-lg bg-sign-soft border border-sign/20 px-4 py-3 text-sign">
          {sp.added ? "تمت إضافة السائق." : "تم حذف السائق."}
        </p>
      )}
      <Card className="p-6">
        <h2 className="font-semibold mb-4">إضافة سائق</h2>
        <DriverFields key={`new-${rows.length}`} />
      </Card>

      {rows.length === 0 ? (
        <p className="text-muted">لا يوجد سائقون بعد.</p>
      ) : (
        <ul className="space-y-4" data-testid="driver-list">
          {rows.map((d) => {
            const r = ratings.get(d.id);
            const t = tripCount.get(d.id);
            return (
              <li key={d.id}>
                <Card className="overflow-hidden">
                  <div className="flex flex-wrap gap-4 p-4">
                    <DriverPhoto d={d} className="size-20 rounded-xl" />
                    <div className="min-w-0 flex-1 space-y-1 text-sm">
                      <p className="font-semibold text-[16px]">
                        {d.name} {!d.active && <span className="text-danger text-sm font-normal">· موقوف</span>}
                      </p>
                      <p dir="ltr" className="text-muted" style={{ textAlign: "right" }}>
                        {d.phone}
                      </p>
                      <p>
                        {[d.carType, d.carModel, d.carColor].filter(Boolean).join(" · ")} · اللوحة <bdi className="font-medium">{d.plateNumber}</bdi>
                      </p>
                      <p className="text-muted flex flex-wrap items-center gap-x-3">
                        {r ? (
                          <Link href={`/admin/ratings?driver=${d.id}`} className="inline-flex items-center gap-1 hover:text-ink">
                            <Stars value={r.avg} size="sm" /> {formatNumber(r.avg, "ar", 1)} ({formatNumber(r.count, "ar")} تقييم)
                          </Link>
                        ) : (
                          <span>لا تقييمات بعد</span>
                        )}
                        <span>
                          {formatNumber(t?.done ?? 0, "ar")} رحلة منتهية، {formatNumber(t?.upcoming ?? 0, "ar")} قادمة
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      <a href={waLink(d.phone)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost !min-h-9 !py-1 text-sm">
                        <WhatsAppIcon className="size-4" /> واتساب
                      </a>
                      <ActionForm action={deleteDriver} submitLabel="حذف" pendingLabel="جارٍ الحذف…" submitClassName="btn btn-ghost !min-h-9 !py-1 text-sm !text-danger" className="">
                        <input type="hidden" name="id" value={d.id} />
                      </ActionForm>
                    </div>
                  </div>
                  <details className="border-t border-line">
                    <summary className="cursor-pointer px-4 py-3 text-sm text-sign">تعديل بيانات السائق</summary>
                    <div className="px-4 pb-5 space-y-4">
                      <DriverFields d={d} />
                      {d.hasPhoto && (
                        <ActionForm action={removeDriverPhoto} submitLabel="حذف الصورة الشخصية" submitClassName="btn btn-ghost !min-h-9 !py-1 text-sm !text-danger" className="">
                          <input type="hidden" name="id" value={d.id} />
                        </ActionForm>
                      )}
                    </div>
                  </details>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DriverFields({ d }: { d?: Row }) {
  return (
    <ActionForm action={saveDriver} submitLabel={d ? "حفظ" : "إضافة السائق"}>
      {d && <input type="hidden" name="id" value={d.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="اسم السائق">
          <input name="name" required minLength={2} maxLength={80} defaultValue={d?.name} className="field" />
        </Field>
        <Field label="رقم الجوال (واتساب)" hint="مثل 0501234567. تصل عليه رسائل الرحلات">
          <input name="phone" type="tel" required maxLength={20} defaultValue={d?.phone} dir="ltr" className="field text-start" inputMode="tel" />
        </Field>
        <Field label="رقم اللوحة" hint="مثل: أ ب ج ١٢٣٤">
          <input name="plateNumber" required maxLength={30} defaultValue={d?.plateNumber} className="field" />
        </Field>
        <Field label="نوع السيارة" hint="مثل: تويوتا كامري">
          <input name="carType" required maxLength={60} defaultValue={d?.carType} className="field" />
        </Field>
        <Field label="الموديل" hint="سنة الصنع، مثل 2024">
          <input name="carModel" maxLength={20} defaultValue={d?.carModel} className="field" />
        </Field>
        <Field label="اللون">
          <input name="carColor" maxLength={30} defaultValue={d?.carColor} className="field" />
        </Field>
        <Field label={d?.hasPhoto ? "صورة شخصية جديدة (اختياري)" : "الصورة الشخصية"} hint="PNG أو JPG أو WEBP حتى ٢ ميجابايت. تظهر للعميل في صفحة حجزه">
          <input type="file" name="photo" accept="image/png,image/jpeg,image/webp" className="field" />
        </Field>
        <Field label="ملاحظات داخلية (اختياري)">
          <input name="notes" maxLength={500} defaultValue={d?.notes} className="field" />
        </Field>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="active" defaultChecked={d?.active ?? true} className="size-4 accent-sign" />
        متاح لإسناد الرحلات
      </label>
    </ActionForm>
  );
}
