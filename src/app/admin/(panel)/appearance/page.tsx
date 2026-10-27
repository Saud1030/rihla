import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSection } from "@/lib/auth";
import { getBrand } from "@/lib/brand";
import { getSettings } from "@/lib/catalog";
import { getDictionary } from "@/i18n/dictionaries";
import { removeLogo, saveAppearance, uploadLogo } from "../../actions";
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
    </div>
  );
}
