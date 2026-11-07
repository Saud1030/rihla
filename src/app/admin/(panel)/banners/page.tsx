import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { todayInRiyadh } from "@/lib/booking";
import { formatDate } from "@/lib/format";
import { deleteBanner, removeHero, saveBanner, saveHomeDisplay, toggleBanner, uploadHero } from "../../banner-actions";
import { getSettings } from "@/lib/catalog";
import { getBrand, heroImages, HERO_SLOTS } from "@/lib/brand";
import { getDictionary } from "@/i18n/dictionaries";
import { HeroUploader } from "@/components/admin/hero-uploader";

const t = getDictionary("ar");
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
  const [st, heroes, brand] = await Promise.all([getSettings(), heroImages(), getBrand()]);
  const hero = heroes[0];
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
          صورة تظهر خلف لوحة الحجز والعنوان في أعلى الصفحة الرئيسية، وباقي الصفحة كما هو. المقاس المقترح ١٩٢٠×٩٠٠ بكسل (PNG أو JPG أو WEBP، حتى ٣ ميجابايت). تقدر تضيف حتى ٥ صور تتبدّل تلقائيًا بحركة ناعمة، وتشوف المعاينة قبل الحفظ.
        </p>
        {sp.hero === "deleted" && !hero && (
          <p role="status" className="mb-4 rounded-lg bg-sign-soft border border-sign/20 px-4 py-3 text-sign">
            تم حذف الخلفية. يظهر أعلى الصفحة الرئيسية الآن بدون صورة.
          </p>
        )}
        {sp.hero === "added" && (
          <p role="status" className="mb-4 rounded-lg bg-sign-soft border border-sign/20 px-4 py-3 text-sign">
            تم رفع الخلفية، وتظهر الآن خلف أعلى الصفحة الرئيسية.
          </p>
        )}
        {heroes.length > 0 && (
          <div className="mb-5">
            <p className={`text-sm mb-2 ${heroOn ? "text-sign" : "text-danger"}`}>
              {heroOn ? (heroes.length > 1 ? `تظهر الآن في الموقع: ${heroes.length} صور تتبدّل تلقائيًا` : "تظهر الآن في الموقع") : "مخفية عن الموقع"}
            </p>
            <ul className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" data-testid="hero-list">
              {heroes.map((h, n) => (
                <li key={h.key} className="space-y-1">
                  {/* eslint-disable-next-line @next/next/no-img-element -- served from our own API route */}
                  <img src={h.url} alt={`الخلفية ${n + 1}`} className={`w-full aspect-[16/9] rounded-lg border border-line object-cover ${heroOn ? "" : "opacity-40"}`} />
                  <ActionForm action={removeHero} submitLabel={heroes.length === 1 ? "حذف الخلفية" : `حذف الصورة ${n + 1}`} pendingLabel="جارٍ الحذف…" submitClassName="text-xs text-danger hover:underline" className="">
                    <input type="hidden" name="slot" value={h.key} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          </div>
        )}
        {heroes.length < HERO_SLOTS.length ? (
          <ActionForm action={uploadHero} submitLabel={hero ? "حفظ الخلفية" : "رفع الخلفية"} pendingLabel="جارٍ الرفع…">
            <HeroUploader
              current={hero?.url ?? null}
              title={brand.hero.title.ar || t.hero.title}
              lead={brand.hero.lead.ar || t.hero.lead}
            />
          </ActionForm>
        ) : (
          <p className="text-sm text-muted">وصلت للحد الأقصى (٥ صور). احذف صورة لإضافة غيرها.</p>
        )}
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
          <label className="flex items-start gap-3">
            <input type="checkbox" name="hero_bg_preset" defaultChecked={st.hero_bg_preset === "saudi" || (st.hero_bg_preset !== "none" && !hero)} className="size-4 mt-1 accent-sign" />
            <span>
              <span className="block font-medium">الخلفية الجاهزة: معالم السعودية</span>
              <span className="block text-sm text-muted">ساعة مكة والمسجد النبوي وبرج المملكة والفيصلية ونافورة جدة مع السيارة، بنسخة نهارية للوضع العادي وليلية للوضع الداكن. إذا اخترتها تظهر بدل الصور المرفوعة (الصور تبقى محفوظة).</span>
              <span className="mt-2 flex gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/hero/saudi-light-1280.webp" alt="النسخة النهارية" className="w-40 rounded-md border border-line" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/hero/saudi-dark-1280.webp" alt="النسخة الليلية" className="w-40 rounded-md border border-line" />
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="hero_bg_animate" defaultChecked={st.hero_bg_animate !== "0"} className="size-4 mt-1 accent-sign" />
            <span>
              <span className="block font-medium">تحريك الخلفية تلقائيًا</span>
              <span className="block text-sm text-muted">إذا كانت أكثر من صورة تتبدّل بتلاشٍ ناعم. الصور تظهر كما رفعتها بنفس الدقة والألوان.</span>
            </span>
          </label>
          <Field label="مدة كل صورة خلفية">
            <select name="hero_bg_seconds" defaultValue={st.hero_bg_seconds || "7"} className="field max-w-48">
              {["5", "7", "10", "15"].map((v) => (
                <option key={v} value={v}>
                  {v} ثوانٍ
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="banners_enabled" defaultChecked={st.banners_enabled !== "0"} className="size-4 mt-1 accent-sign" />
            <span>
              <span className="block font-medium">إظهار قسم البنرات (العروض) تحت لوحة الحجز</span>
              <span className="block text-sm text-muted">يخفي كل البنرات مرة واحدة. ولإخفاء أو حذف بنر واحد استخدم الأزرار في قائمة البنرات بالأسفل.</span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="banners_autoplay" defaultChecked={st.banners_autoplay !== "0"} className="size-4 mt-1 accent-sign" />
            <span>
              <span className="block font-medium">تحريك البنرات تلقائيًا</span>
              <span className="block text-sm text-muted">تتوقف الحركة إذا مرّ الزائر بالمؤشر فوق البنر.</span>
            </span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset>
              <legend className="text-sm font-medium mb-2">نوع الحركة</legend>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["slide", "انزلاق"],
                    ["fade", "تلاشٍ"],
                  ] as const
                ).map(([v, label]) => (
                  <label key={v} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 has-[:checked]:border-sign has-[:checked]:bg-sign-soft">
                    <input type="radio" name="banners_effect" value={v} defaultChecked={(st.banners_effect || "slide") === v} className="accent-sign" />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="مدة كل بنر">
              <select name="banners_seconds" defaultValue={st.banners_seconds || "6"} className="field max-w-48">
                {["4", "6", "8", "12"].map((v) => (
                  <option key={v} value={v}>
                    {v} ثوانٍ
                  </option>
                ))}
              </select>
            </Field>
          </div>
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
