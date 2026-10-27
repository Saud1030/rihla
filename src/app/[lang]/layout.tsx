import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import "../globals.css";
import { dir, getDictionary, isLocale, locales, type Locale } from "@/i18n/dictionaries";
import { site } from "@/config/site";
import { getBrand } from "@/lib/brand";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { NoticeBar } from "@/components/site/notice-bar";
import { ChatLauncher } from "@/components/site/chat-launcher";

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getDictionary(lang);
  const brand = await getBrand();
  return {
    metadataBase: new URL(site.url),
    title: { default: `${brand.name[lang]} | ${t.meta.title}`, template: `%s | ${brand.name[lang]}` },
    description: t.meta.description,
    alternates: { languages: { ar: "/ar", en: "/en" } },
    openGraph: { siteName: brand.name[lang], locale: lang === "ar" ? "ar_SA" : "en_US", type: "website" },
    ...(brand.logoUrl ? { icons: { icon: brand.logoUrl } } : {}),
  };
}

/**
 * Header, footer and theme depend on settings edited in the admin panel, so the
 * whole page renders at request time. Settings are cached in memory, so this is fast.
 */
async function BrandShell({ lang, children }: { lang: Locale; children: React.ReactNode }) {
  await connection();
  const [brand, t] = [await getBrand(), getDictionary(lang)];
  return (
    <>
      <style>{brand.css}</style>
      <NoticeBar lang={lang} />
      <SiteHeader lang={lang} t={t} brand={brand} />
      <main className="flex-1">{children}</main>
      <SiteFooter lang={lang} t={t} brand={brand} />
      <ChatLauncher lang={lang} t={t} />
    </>
  );
}

export default async function SiteLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  return (
    <html lang={lang} dir={dir(lang)}>
      <body className="min-h-dvh flex flex-col">
        <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
          <BrandShell lang={lang}>{children}</BrandShell>
        </Suspense>
      </body>
    </html>
  );
}
