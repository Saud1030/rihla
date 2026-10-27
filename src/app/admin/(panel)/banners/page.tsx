import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { todayInRiyadh } from "@/lib/booking";
import { formatDate } from "@/lib/format";
import { deleteBanner, removeHero, saveBanner, saveHomeDisplay, toggleBanner, uploadHero } from "../../banner-actions";
import { getSettings } from "@/lib/catalog";
import { ActionForm } from "@/components/admin/action-form";
import { Card, Field, PageHeader, Skeleton } from "@/components/admin/ui";

type Row = Omit<typeof s.banners.$inferSelect, "data">;

export default function BannersPage({ searchParams }: PageProps<"/admin/banners">) {
  return (
    <>
      <PageHeader title="الخلفية والبنرات" />
      <Suspense fallback={<Skeleton h="h-96" />}>
        <Banners searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Banners({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection("appearance");
  const sp = await searchParams;
  const rows: Row[] = await db
    .select({
      id: s.banners.id,
      titleAr: s.banners.titleAr,
      titleEn: s.banners.titleEn,
      textAr: s.banners.textAr,
      textEn: s.banners.textEn,
      link: s.banners.link,
      mime: s.banners.mime,
      active: s.banners.active,
      sortOrder: s.banners.sortOrder,
      startsOn: s.banners.startsOn,
      endsOn: s.banners.endsOn,
      updatedAt: s.banners.updatedAt,
    })
    .from(s.banners)
    .orderBy(asc(s.banners.sortOrder), asc(s.banners.id));
  const [st, [hero]] = await Promise.all([
    getSettings(),
    db.select({ updatedAt: s.assets.updatedAt }).from(s.assets).where(eq(s.assets.key, "hero")).limit(1),
  ]);
  const heroOn = st.hero_bg_enabled !== "0";
  const today = todayInRiyadh();
  const state = (b: Row) =>
    !b.active ? ["مخفي", "text-danger"] : b.startsOn && b.startsOn > today ? ["يبدأ لاحقًا", "text-amber-deep"] : b.endsOn && b.endsOn < today ? ["انتهى", "text-muted"] : ["يظهر الآن", "text-sign"];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* ---------- background behind the top section ---------- */}
      <Card className="p-6" data-testid="hero-card">
        <h2 className="font-semibold">خلفية أعلى الصفحة الرئيسية</h2>
        <p className="text-sm text-muted mt-1 mb-4 max-w-[70ch]">
          صورة تظهر خلف لوحة الحجز والعنوان في أعلى الصفحة الرئيسية، وباقي الصفحة كما هو. المقاس المقترح ١٩٢٠×٩٠٠ بكسل (PNG أو JPG أو WEBP، حتى ٣ ميجابايت).
        </p>
        {sp.hero === "deleted" && !hero && (
          <p role="status" className="mb-4 rounded-lg bg-sign-soft border border-sign/20 px-4 py-3 text-sign">
            تم حذف الخلفية. يظهر أعلى الصفحة الرئيسية الآن بدون صورة.
          </p>
        )}
        <div className="grid gap-5 sm:grid-cols-[240px_1fr] items-start">
          <div className="rounded-lg border border-line bg-stone overflow-hidden aspect-[16/9] grid place-items-center text-sm text-muted">
            {hero ? (
              // eslint-disable-next-line @next/next/no-img-element -- served from our own API route
              <img src={`/api/brand/hero?v=${hero.updatedAt.getTime().toString(36)}`} alt="الخلفية الحالية" className={`size-full object-cover ${heroOn ? "" : "opacity-40"}`} />
            ) : (
              "لا توجد خلفية"
            )}
          </div>
          <div className="space-y-4">
            {hero && <p className={`text-sm ${heroOn ? "text-sign" : "text-danger"}`}>{heroOn ? "تظهر الآن في الموقع" : "مخفية عن الموقع"}</p>}
            <ActionForm action={uploadHero} submitLabel={hero ? "استبدال الخلفية" : "رفع الخلفية"} pendingLabel="جارٍ الرفع…">
              <Field label={hero ? "صورة جديدة" : "صورة الخلفية"}>
                <input type="file" name="hero" accept="image/png,image/jpeg,image/webp" required className="field" />
              </Field>
            </ActionForm>
            {hero && (
              <ActionForm action={removeHero} submitLabel="حذف الخلفية" pendingLabel="جارٍ الحذف…" submitClassName="btn btn-ghost !min-h-9 !py-1 text-sm !text-danger">
                <span className="sr-only">حذف الخلفية</span>
              </ActionForm>
            )}
          </div>
        </div>
      </Card>

      {/* ---------- what shows on the home page ---------- */}
      <Card className="p-6">
        <h2 className="font-semibold mb-4">الإظهار في الصفحة الرئيسية</h2>
        <ActionForm action={saveHomeDisplay} submitLabel="حفظ">
          <label className="flex items-start gap-3">
            <input type="checkbox" name="hero_bg_enabled" defaultChecked={heroOn} className="size-4 mt-1 accent-sign" />
            <span>
              <span className="block font-medium">إظهار الخلفية خلف أعلى الصفحة</span>
              <span className="block text-sm text-muted">أخفِها مؤقتًا بدون حذفها.</span>
            </span>
          </label>
          <fieldset>
            <legend className="text-sm font-medium mb-2">طبقة فوق الخلفية لوضوح النص</legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["light", "خفيفة"],
                  ["medium", "متوسطة"],
                  ["strong", "قوية"],
                ] as const
              ).map(([v, label]) => (
                <label key={v} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 has-[:checked]:border-sign has-[:checked]:bg-sign-soft">
                  <input type="radio" name="hero_bg_overlay" value={v} defaultChecked={(st.hero_bg_overlay || "light") === v} className="accent-sign" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="banners_enabled" defaultChecked={st.banners_enabled !== "0"} className="size-4 mt-1 accent-sign" />
            <span>
              <span className="block font-medium">إظهار قسم البنرات (العروض) تحت لوحة الحجز</span>
              <span className="block text-sm text-muted">يخفي كل البنرات مرة واحدة. ولإخفاء أو حذف بنر واحد استخدم الأزرار في قائمة البنرات بالأسفل.</span>
            </span>
          </label>
        </ActionForm>
      </Card>

      <h2 className="text-xl font-semibold pt-2">بنرات العروض</h2>
      <p className="text-muted max-w-[70ch]">
        تظهر البنرات تحت لوحة الحجز في الصفحة الرئيسية، وإذا كان هناك أكثر من بنر تتبدّل تلقائيًا. المقاس المقترح ١٦٠٠×٥٠٠ بكسل (PNG أو JPG أو WEBP، حتى ٢ ميجابايت).
      </p>
      {(sp.added || sp.deleted) && (
        <p role="status" className="rounded-lg bg-sign-soft border border-sign/20 px-4 py-3 text-sign">
          {sp.added ? "تمت إضافة البنر، ويظهر في الصفحة الرئيسية." : "تم حذف البنر."}
        </p>
      )}
      <Card className="p-6">
        <h2 className="font-semibold mb-4">إضافة بنر</h2>
        {/* remounts (empty) once the new banner is in the list */}
        <BannerFields key={`new-${rows.length}`} />
      </Card>

      {rows.length === 0 ? (
        <p className="text-muted">لا توجد بنرات بعد. لن يظهر شيء في الصفحة الرئيسية حتى تضيف بنرًا.</p>
      ) : (
        <ul className="space-y-4" data-testid="banner-list">
          {rows.map((b) => {
            const [label, cls] = state(b);
            return (
              <li key={b.id}>
                <Card className="overflow-hidden">
                  <div className="grid sm:grid-cols-[260px_1fr]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- served from our own API route */}
                    <img src={`/api/banners/${b.id}?v=${b.updatedAt.getTime()}`} alt={b.titleAr || "بنر"} className="w-full h-36 object-cover bg-stone" />
                    <div className="p-4 space-y-1 text-sm">
                      <p className="font-medium text-[15px]">{b.titleAr || "بدون عنوان"}</p>
                      <p className={cls}>{label}</p>
                      <p className="text-muted">
                        الترتيب {b.sortOrder}
                        {b.startsOn ? ` · من ${formatDate(b.startsOn, "ar")}` : ""}
                        {b.endsOn ? ` · حتى ${formatDate(b.endsOn, "ar")}` : ""}
                      </p>
                      {b.link && (
                        <p className="text-muted truncate" dir="ltr">
                          {b.link}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-3 pt-2">
                        <ActionForm action={toggleBanner} submitLabel={b.active ? "إخفاء" : "إظهار"} submitClassName="btn btn-ghost !min-h-9 !py-1 text-sm" className="">
                          <input type="hidden" name="id" value={b.id} />
                        </ActionForm>
                        <ActionForm action={deleteBanner} submitLabel="حذف" pendingLabel="جارٍ الحذف…" submitClassName="btn btn-ghost !min-h-9 !py-1 text-sm !text-danger" className="">
                          <input type="hidden" name="id" value={b.id} />
                        </ActionForm>
                      </div>
                    </div>
                  </div>
                  <details className="border-t border-line">
                    <summary className="cursor-pointer px-4 py-3 text-sm text-sign">تعديل البنر</summary>
                    <div className="px-4 pb-5">
                      <BannerFields b={b} />
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

function BannerFields({ b }: { b?: Row }) {
  return (
    <ActionForm action={saveBanner} submitLabel={b ? "حفظ البنر" : "إضافة البنر"}>
      {b && <input type="hidden" name="id" value={b.id} />}
      <Field label={b ? "صورة جديدة (اختياري)" : "صورة البنر"} hint="PNG أو JPG أو WEBP، حتى ٢ ميجابايت">
        <input type="file" name="image" accept="image/png,image/jpeg,image/webp" required={!b} className="field" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="العنوان (عربي، اختياري)">
          <input name="titleAr" defaultValue={b?.titleAr} maxLength={120} className="field" />
        </Field>
        <Field label="العنوان (إنجليزي، اختياري)">
          <input name="titleEn" defaultValue={b?.titleEn} maxLength={120} dir="ltr" className="field" />
        </Field>
        <Field label="نص قصير (عربي، اختياري)">
          <input name="textAr" defaultValue={b?.textAr} maxLength={240} className="field" />
        </Field>
        <Field label="نص قصير (إنجليزي، اختياري)">
          <input name="textEn" defaultValue={b?.textEn} maxLength={240} dir="ltr" className="field" />
        </Field>
        <Field label="الرابط عند الضغط (اختياري)" hint="صفحة في موقعك مثل /ar/routes أو رابط يبدأ بـ https://" className="sm:col-span-2">
          <input name="link" defaultValue={b?.link} maxLength={300} dir="ltr" className="field text-start" placeholder="/ar/routes" />
        </Field>
        <Field label="يبدأ من (اختياري)">
          <input type="date" name="startsOn" defaultValue={b?.startsOn ?? ""} className="field" />
        </Field>
        <Field label="ينتهي في (اختياري)">
          <input type="date" name="endsOn" defaultValue={b?.endsOn ?? ""} className="field" />
        </Field>
        <Field label="الترتيب" hint="الأصغر يظهر أولًا">
          <input type="number" name="sortOrder" min={0} max={999} defaultValue={b?.sortOrder ?? 0} className="field tabular" />
        </Field>
        <label className="flex items-center gap-2 self-end pb-3">
          <input type="checkbox" name="active" defaultChecked={b ? b.active : true} className="size-4 accent-sign" />
          <span>يظهر في الموقع</span>
        </label>
      </div>
    </ActionForm>
  );
}
