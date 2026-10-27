import Link from "next/link";
import { Suspense } from "react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import type { Brand } from "@/lib/brand";
import { LangSwitch } from "./lang-switch";

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

export function SiteHeader({ lang, t, brand }: { lang: Locale; t: Dictionary; brand: Brand }) {
  const links = [
    { href: `/${lang}`, label: t.nav.home },
    { href: `/${lang}/routes`, label: t.nav.routes },
    { href: `/${lang}/fleet`, label: t.nav.fleet },
    { href: `/${lang}/booking`, label: t.nav.myBooking },
    { href: `/${lang}/contact`, label: t.nav.contact },
  ];
  return (
    <header className="bg-paper border-b border-line">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-4">
        <Logo lang={lang} brand={brand} />
        <nav className="hidden lg:flex items-center gap-1 ms-2" aria-label="Main">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="px-3 py-2 rounded-md text-[15px] text-muted hover:text-ink hover:bg-stone">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-2">
          <Suspense fallback={<span className="px-3 py-2 text-[15px] text-muted">{t.nav.switchLang}</span>}>
            <LangSwitch lang={lang} label={t.nav.switchLang} />
          </Suspense>
          <Link href={`/${lang}#search`} className="btn btn-primary !min-h-10 !py-2 text-[15px]">
            {t.nav.book}
          </Link>
        </div>
      </div>
      {/* Mobile nav */}
      <nav className="lg:hidden border-t border-line overflow-x-auto" aria-label="Main mobile">
        <div className="flex px-2">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="px-3 py-2.5 text-sm text-muted whitespace-nowrap">
              {l.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
