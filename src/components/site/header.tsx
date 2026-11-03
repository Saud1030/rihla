import Link from "next/link";
import { Suspense } from "react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import type { Brand } from "@/lib/brand";
import { LangSwitch } from "./lang-switch";
import { GlassNav, type GlassLink } from "./glass-nav";

export function Logo({ lang, brand }: { lang: Locale; brand: Brand }) {
  return (
    <Link href={`/${lang}`} className="flex items-center gap-3 shrink-0 min-w-0">
      {brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- uploaded logo, any size/format incl. SVG
        <img src={brand.logoUrl} alt="" className="h-10 w-auto max-w-40 object-contain" />
      ) : (
        <span aria-hidden="true" className="sign grid place-items-center h-10 px-3.5 font-display font-semibold text-[15px] leading-none">
          {brand.mark[lang]}
        </span>
      )}
      <span className="sr-only sm:not-sr-only font-display font-medium text-ink truncate">{brand.name[lang]}</span>
    </Link>
  );
}

export function SiteHeader({ lang, t, brand, packages = false }: { lang: Locale; t: Dictionary; brand: Brand; packages?: boolean }) {
  const links: GlassLink[] = [
    { href: `/${lang}`, label: t.nav.home, icon: "home", exact: true },
    { href: `/${lang}/routes`, label: t.nav.routes, icon: "routes" },
    { href: `/${lang}/fleet`, label: t.nav.fleet, icon: "fleet" },
    { href: `/${lang}/booking`, label: t.nav.myBooking, icon: "booking" },
    { href: `/${lang}/contact`, label: t.nav.contact, icon: "contact" },
  ];
  const themeLabels = lang === "ar" ? { dark: "الوضع الداكن", light: "الوضع الفاتح" } : { dark: "Dark mode", light: "Light mode" };
  return (
    <header className="site-header sticky top-0 z-40 border-b border-line">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-4">
        <Logo lang={lang} brand={brand} />
        {/* the glass pill menu: in the middle on wide screens, in its own row on phones */}
        <div className="hidden lg:flex flex-1 justify-center min-w-0">
          <GlassNav links={links} themeLabels={themeLabels} />
        </div>
        <div className="ms-auto lg:ms-0 flex items-center gap-2">
          <Suspense fallback={<span className="px-3 py-2 text-[15px] text-muted">{t.nav.switchLang}</span>}>
            <LangSwitch lang={lang} label={t.nav.switchLang} />
          </Suspense>
          <Link href={`/${lang}#search`} className="btn btn-primary !min-h-10 !py-2 !px-3 sm:!px-5 text-[15px] rounded-full whitespace-nowrap">
            {t.nav.book}
          </Link>
          {/* right after "Book now", so customers see the packages straight away */}
          {packages && (
            <Link href={`/${lang}/packages`} className="btn btn-amber !min-h-10 !py-2 !px-3 sm:!px-5 text-[15px] rounded-full whitespace-nowrap" data-testid="packages-link">
              {t.packages.nav}
            </Link>
          )}
        </div>
      </div>
      <div className="lg:hidden px-3 pb-2.5">
        <GlassNav links={links} themeLabels={themeLabels} />
      </div>
    </header>
  );
}
