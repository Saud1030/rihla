import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSection } from "@/lib/auth";
import { getBrand } from "@/lib/brand";
import { getSettings } from "@/lib/catalog";
import { getDictionary } from "@/i18n/dictionaries";
import { removeLogo, saveAppearance, saveFooter, uploadLogo } from "../../actions";
import { Field } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/action-form";
import { AppearanceForm } from "@/components/admin/appearance-form";
import { Card, PageHeader, Skeleton } from "@/components/admin/ui";

export const metadata: Metadata = { title: "المظهر" };

export default function AppearancePage() {
  return (
    <>
      <PageHeader title="المظهر والشعار" />
      <Suspense fallback={<Skeleton h="h-[700px]" />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
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
    </div>
  );
}
