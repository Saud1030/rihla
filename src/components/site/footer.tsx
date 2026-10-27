import Link from "next/link";
import { Suspense } from "react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import type { Brand } from "@/lib/brand";
import { getSettings } from "@/lib/catalog";

async function FooterContact({ lang, t }: { lang: Locale; t: Dictionary }) {
  const s = await getSettings();
  return (
    <address className="not-italic text-sm text-white/80 space-y-1">
      <p>{lang === "ar" ? s.address_ar : s.address_en}</p>
      {s.phone && (
        <p>
          <a href={`tel:${s.phone}`} dir="ltr" className="hover:text-white">
            {s.phone}
          </a>
        </p>
      )}
      {s.email && (
        <p>
          <a href={`mailto:${s.email}`} className="hover:text-white">
            {s.email}
          </a>
        </p>
      )}
      {s.cr_number && (
        <p>
          {t.footer.cr}: <span className="tabular">{s.cr_number}</span>
        </p>
      )}
      {s.vat_number && (
        <p>
          {t.footer.vat}: <span className="tabular">{s.vat_number}</span>
        </p>
      )}
    </address>
  );
}

export function SiteFooter({ lang, t, brand }: { lang: Locale; t: Dictionary; brand: Brand }) {
  return (
    <footer className="bg-sign-deep text-white mt-20">
      <div className="mx-auto max-w-6xl px-4 py-12 grid gap-10 md:grid-cols-3">
        <div>
          <p className="font-display text-lg font-medium">{brand.name[lang]}</p>
          <p className="text-sm text-white/70 mt-2 max-w-xs">{t.meta.description}</p>
        </div>
        <nav className="text-sm space-y-2" aria-label="Footer">
          <Link href={`/${lang}/routes`} className="block text-white/80 hover:text-white">{t.nav.routes}</Link>
          <Link href={`/${lang}/fleet`} className="block text-white/80 hover:text-white">{t.nav.fleet}</Link>
          <Link href={`/${lang}/booking`} className="block text-white/80 hover:text-white">{t.nav.myBooking}</Link>
          <Link href={`/${lang}/contact`} className="block text-white/80 hover:text-white">{t.nav.contact}</Link>
          <Link href={`/${lang}/terms`} className="block text-white/80 hover:text-white">{t.footer.terms}</Link>
        </nav>
        <Suspense fallback={null}>
          <FooterContact lang={lang} t={t} />
        </Suspense>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-white/60">
          {t.footer.rights} {brand.name[lang]}
        </p>
      </div>
    </footer>
  );
}
