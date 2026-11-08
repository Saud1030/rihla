import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSection } from "@/lib/auth";
import { customFontCss, customFontVersion, getBrand } from "@/lib/brand";
import { getSettings } from "@/lib/catalog";
import { getDictionary } from "@/i18n/dictionaries";
import { removeFont, removeLogo, saveAppearance, saveFooter, uploadFont, uploadLogo } from "../../actions";
import { Field } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/action-form";
import { AppearanceForm } from "@/components/admin/appearance-form";
import { FooterBuilder } from "@/components/admin/footer-builder";
import { saveFooterBlocks } from "../../footer-actions";
import { parseFooter } from "@/lib/footer";
import { savePromoVideo } from "../../promo-video-actions";
import { PromoVideoSlots } from "@/components/admin/promo-video-slots";
import { MAX_VIDEO_MB, promoVideoVersions, VIDEO_SLOTS, videoUrl } from "@/lib/promo-video";
import { Card, PageHeader, Skeleton } from "@/components/admin/ui";

export const metadata: Metadata = { title: "المظهر" };

export default function AppearancePage({ searchParams }: PageProps<"/admin/appearance">) {
  return (
    <>
      <PageHeader title="المظهر والشعار" />
      <Suspense fallback={<Skeleton h="h-[700px]" />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const fontRemoved = (await searchParams).font === "removed";
  await requireSection("appearance");
  const [brand, st] = await Promise.all([getBrand(), getSettings()]);
  const t = getDictionary("ar");

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="font-semibold">الشعار</h2>
        <div className="mt-4 flex flex-wrap items-center gap-6">
          <div className="grid place-items-center h-24 w-48 rounded-lg border border-dashed border-line bg-stone/60">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt="الشعار الحالي" className="max-h-20 max-w-44 object-contain" />
            ) : (
              <span className="sign grid place-items-center h-10 px-4 font-display font-semibold">{brand.mark.ar}</span>
            )}
          </div>
          <div className="space-y-3 min-w-0 flex-1">
            <ActionForm action={uploadLogo} submitLabel="رفع الشعار" pendingLabel="جارٍ الرفع…" className="space-y-3">
              <label className="block">
                <span className="block text-sm font-medium mb-1">ملف الشعار</span>
                <input
                  type="file"
                  name="logo"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  required
                  className="block w-full text-sm file:me-3 file:rounded-md file:border-0 file:bg-sign file:px-3 file:py-2 file:text-white file:font-medium"
                />
                <span className="block text-xs text-muted mt-1">PNG أو JPG أو WEBP أو SVG، حتى ١ ميجابايت. الأفضل صورة عرضية بخلفية شفافة.</span>
              </label>
            </ActionForm>
            <ActionForm
              action={removeLogo}
              submitLabel="حذف الشعار والرجوع لشعار النص"
              submitDisabled={!brand.logoUrl}
              submitClassName="btn btn-ghost !min-h-9 !py-1 text-sm"
            >
              {null}
            </ActionForm>
          </div>
        </div>
      </Card>

      <AppearanceForm
        action={saveAppearance}
        initialTheme={brand.theme}
        customFont={brand.customFont}
        logoUrl={brand.logoUrl}
        placeholders={{ heroTitle: t.hero.title, heroLead: t.hero.lead }}
        initialHeroMode={st.hero_text_mode === "custom" || st.hero_text_mode === "hidden" ? st.hero_text_mode : (st.hero_title_ar || st.hero_lead_ar) ? "custom" : "default"}
        initialTexts={{
          company_name_ar: brand.name.ar,
          company_name_en: brand.name.en,
          logo_text_ar: st.logo_text_ar ?? brand.mark.ar,
          logo_text_en: st.logo_text_en ?? brand.mark.en,
          hero_title_ar: st.hero_title_ar ?? "",
          hero_title_en: st.hero_title_en ?? "",
          hero_lead_ar: st.hero_lead_ar ?? "",
          hero_lead_en: st.hero_lead_en ?? "",
        }}
      />

      {/* the uploaded font, so the sample line and the preview can show it here too */}
      <style>{customFontCss(await customFontVersion())}</style>
      {/* a font file the owner has (e.g. Expo Arabic, which is sold under licence) */}
      <Card className="p-6" data-testid="font-upload">
        <h2 className="font-semibold mb-1">خط خاص (مثل خط إكسبو)</h2>
        {fontRemoved && (
          <p role="status" className="mb-3 rounded-lg bg-sign-soft border border-sign/20 px-4 py-2 text-sign">
            تم حذف الخط المرفوع.
          </p>
        )}
        <p className="text-sm text-muted mb-4 max-w-[75ch]">
          ارفع ملف الخط اللي عندك رخصته (WOFF2 أو WOFF أو TTF أو OTF، حتى ٣ ميجابايت)، ثم اختر «خطي المرفوع» من قائمة الخط فوق واحفظ المظهر.
          {brand.customFont && (
            <>
              {" "}
              الخط الحالي: <strong className="text-ink">{brand.customFont}</strong>
            </>
          )}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <ActionForm action={uploadFont} submitLabel="رفع الخط" pendingLabel="جارٍ الرفع…" className="flex flex-wrap items-end gap-3">
            <Field label="اسم الخط">
              <input name="font_name" maxLength={40} placeholder="Expo Arabic" defaultValue={brand.customFont ?? ""} className="field" />
            </Field>
            <Field label="ملف الخط">
              <input name="font" type="file" required accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf" className="field" />
            </Field>
          </ActionForm>
          {brand.customFont && (
            <ActionForm action={removeFont} submitLabel="حذف الخط" submitClassName="btn btn-ghost !min-h-9 !py-1 text-sm" className="">
              {null}
            </ActionForm>
          )}
        </div>
      </Card>

      {/* the footer at the bottom of every page */}
      <Card className="p-6" data-testid="footer-settings">
        <h2 className="font-semibold mb-1">التذييل (أسفل الموقع)</h2>
        <p className="text-sm text-muted mb-4">اترك النص فارغًا ليظهر النص الافتراضي.</p>
        <ActionForm action={saveFooter} submitLabel="حفظ التذييل">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="نبذة عن الشركة (عربي)">
              <textarea name="footer_about_ar" rows={3} maxLength={400} defaultValue={st.footer_about_ar ?? ""} placeholder={t.meta.description} className="field" />
            </Field>
            <Field label="نبذة عن الشركة (إنجليزي)">
              <textarea name="footer_about_en" rows={3} maxLength={400} defaultValue={st.footer_about_en ?? ""} dir="ltr" className="field text-start" />
            </Field>
            <Field label="سطر الحقوق (عربي)" hint={`الافتراضي: ${t.footer.rights} ${brand.name.ar}`}>
              <input name="footer_rights_ar" maxLength={150} defaultValue={st.footer_rights_ar ?? ""} className="field" />
            </Field>
            <Field label="سطر الحقوق (إنجليزي)">
              <input name="footer_rights_en" maxLength={150} defaultValue={st.footer_rights_en ?? ""} dir="ltr" className="field text-start" />
            </Field>
            <Field label="العنوان (عربي)">
              <input name="address_ar" maxLength={300} defaultValue={st.address_ar ?? ""} className="field" />
            </Field>
            <Field label="العنوان (إنجليزي)">
              <input name="address_en" maxLength={300} defaultValue={st.address_en ?? ""} dir="ltr" className="field text-start" />
            </Field>
            <Field label="رقم الهاتف">
              <input name="phone" maxLength={30} defaultValue={st.phone ?? ""} dir="ltr" className="field text-start" />
            </Field>
            <Field label="البريد الإلكتروني">
              <input name="email" type="email" maxLength={200} defaultValue={st.email ?? ""} dir="ltr" className="field text-start" />
            </Field>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="footer_links" defaultChecked={st.footer_links !== "0"} className="size-4 accent-sign" />
            إظهار روابط الصفحات في التذييل (الرحلات، السيارات، حجزي، تواصل معنا، الشروط، انضم كسائق)
          </label>
        </ActionForm>
      </Card>

      {/* the promo video on the home page */}
      <Card className="p-6" data-testid="promo-video-card">
        <h2 className="font-semibold mb-1">الفيديو الإعلاني في الصفحة الرئيسية</h2>
        <p className="text-sm text-muted mb-5">
          ارفع الفيديو الطولي (يظهر على الجوال) والعرضي (يظهر على الكمبيوتر) بالعربي والإنجليزي. يكفي ملف واحد: إذا نقص ملف يُستخدم الموجود. الحد {MAX_VIDEO_MB} ميجابايت لكل ملف، بصيغة MP4.
        </p>
        <ActionForm action={savePromoVideo} submitLabel="حفظ إعدادات الفيديو" pendingLabel="جارٍ الحفظ…" className="space-y-4 mb-6">
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" name="on" defaultChecked={st.promo_video_on === "1"} className="size-4 accent-sign" />
            إظهار الفيديو في الصفحة الرئيسية
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="عنوان فوق الفيديو (عربي، اختياري)">
              <input name="titleAr" defaultValue={st.promo_video_title_ar} maxLength={120} className="field" placeholder="شاهد كيف تحجز في دقيقة" />
            </Field>
            <Field label="عنوان فوق الفيديو (إنجليزي، اختياري)">
              <input name="titleEn" defaultValue={st.promo_video_title_en} maxLength={120} dir="ltr" className="field" placeholder="See how to book in a minute" />
            </Field>
            <Field label="مكانه في الصفحة">
              <select name="place" defaultValue={st.promo_video_place === "top" ? "top" : "after-banners"} className="field">
                <option value="top">تحت الواجهة مباشرة</option>
                <option value="after-banners">بعد البنرات</option>
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="controls" defaultChecked={st.promo_video_sound === "1"} className="size-4 accent-sign" />
            إظهار أزرار التشغيل والصوت (بدونها يشتغل الفيديو تلقائيًا بدون صوت ويتكرر)
          </label>
        </ActionForm>
        <Suspense fallback={<Skeleton h="h-60" />}>
          <PromoVideoUploads />
        </Suspense>
      </Card>

      {/* the full footer builder: columns, pictures, payment logos */}
      <Card className="p-6" data-testid="footer-builder-card">
        <h2 className="font-semibold mb-1">التذييل المخصص: أعمدة وصور وبوابات الدفع</h2>
        <p className="text-sm text-muted mb-5">
          رتّب أعمدة التذييل كما تريد: معلومات الشركة (العنوان الوطني، السجل التجاري، الرقم الضريبي بصورة الشهادة)، روابط، وسائل التواصل، فروعك حسب المدينة، شارات التراخيص والتوثيق، وشعارات طرق الدفع.
        </p>
        <FooterBuilder initial={parseFooter(st.footer_blocks, st)} action={saveFooterBlocks} />
      </Card>
    </div>
  );
}

async function PromoVideoUploads() {
  const have = await promoVideoVersions();
  return <PromoVideoSlots maxMb={MAX_VIDEO_MB} slots={VIDEO_SLOTS.map((slot) => ({ slot, url: have[slot] ? videoUrl(slot, have[slot]!) : null }))} />;
}
