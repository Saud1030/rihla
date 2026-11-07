import Link from "next/link";
import { Suspense } from "react";
import type { Dictionary, Locale } from "@/i18n/dictionaries";
import type { Brand } from "@/lib/brand";
import { getSettings } from "@/lib/catalog";
import { contactHref, footerImg, parseFooter, pick, type FooterConfig, type FooterItem } from "@/lib/footer";
import { ChatIcon, MailIcon, PhoneIcon, PinIcon, WhatsAppIcon } from "@/components/icons";
import { OpenChatButton } from "./open-chat-button";

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

/** the parts of the footer the admin can change (Admin -> Appearance -> footer) */
async function FooterAbout({ lang, t }: { lang: Locale; t: Dictionary }) {
  const s = await getSettings();
  return <p className="text-sm text-white/70 mt-2 max-w-xs whitespace-pre-line">{s[`footer_about_${lang}`]?.trim() || t.meta.description}</p>;
}
async function FooterLinks({ lang, t }: { lang: Locale; t: Dictionary }) {
  const s = await getSettings();
  if (s.footer_links === "0") return null;
  return (
    <nav className="text-sm space-y-2" aria-label="Footer">
      <Link href={`/${lang}/routes`} className="block text-white/80 hover:text-white">{t.nav.routes}</Link>
      <Link href={`/${lang}/fleet`} className="block text-white/80 hover:text-white">{t.nav.fleet}</Link>
      <Link href={`/${lang}/booking`} className="block text-white/80 hover:text-white">{t.nav.myBooking}</Link>
      <Link href={`/${lang}/contact`} className="block text-white/80 hover:text-white">{t.nav.contact}</Link>
      <Link href={`/${lang}/terms`} className="block text-white/80 hover:text-white">{t.footer.terms}</Link>
      <Link href={`/${lang}/drivers/join`} className="block text-white/80 hover:text-white">{t.join.link}</Link>
    </nav>
  );
}
async function FooterRights({ lang, t, brand }: { lang: Locale; t: Dictionary; brand: Brand }) {
  const s = await getSettings();
  return <>{s[`footer_rights_${lang}`]?.trim() || `${t.footer.rights} ${brand.name[lang]}`}</>;
}

/** a page of the site gets the visitor's language in front ("/routes" -> "/ar/routes") */
function href(lang: Locale, url: string) {
  if (!url.startsWith("/")) return url;
  if (/^\/(ar|en)(\/|$)/.test(url) || url.startsWith("/api/")) return url;
  return `/${lang}${url === "/" ? "" : url}`;
}

function MaybeLink({ lang, url, className, children, ltr }: { lang: Locale; url: string | null; className?: string; children: React.ReactNode; ltr?: boolean }) {
  if (!url) return <span className={className} dir={ltr ? "ltr" : undefined}>{children}</span>;
  const external = /^https?:/.test(url);
  if (url.startsWith("/"))
    return (
      <Link href={href(lang, url)} className={className}>
        {children}
      </Link>
    );
  return (
    <a href={url} className={className} dir={ltr ? "ltr" : undefined} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {children}
    </a>
  );
}

const ICONS = { phone: PhoneIcon, email: MailIcon, whatsapp: WhatsAppIcon, location: PinIcon } as const;

function Item({ it, lang }: { it: FooterItem; lang: Locale }) {
  const label = pick(it.label, lang);
  const value = pick(it.value, lang);
  const pic = it.img ? (
    // eslint-disable-next-line @next/next/no-img-element -- uploaded picture of any size
    <img src={footerImg(it.id, it.img)} alt="" loading="lazy" className="h-11 w-auto max-w-16 rounded-md bg-white object-contain p-1 shrink-0" />
  ) : null;
  // a filled title with nothing under it (a number not written yet) isn't shown
  if ((it.kind === "text" || it.kind === "contact" || it.kind === "badge") && !value && !it.img) return null;
  if (!label && !value && !it.img) return null;
  switch (it.kind) {
    case "heading":
      return <p className="font-semibold text-white pt-3 first:pt-0">{label}</p>;
    case "bullet":
      return (
        <p className="flex items-center gap-2 text-white/75">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-amber shrink-0" />
          <MaybeLink lang={lang} url={it.url || null} className="hover:text-white">
            {label}
          </MaybeLink>
        </p>
      );
    case "link":
      return (
        <MaybeLink lang={lang} url={it.url || null} className="block text-white/75 hover:text-white">
          {label}
        </MaybeLink>
      );
    case "contact": {
      const Icon = it.icon !== "none" ? ICONS[it.icon] : null;
      const ltr = it.icon === "phone" || it.icon === "email" || it.icon === "whatsapp";
      return (
        <div className="flex items-start gap-3">
          {Icon && <Icon className="size-5 mt-0.5 shrink-0 text-amber" />}
          <div className="min-w-0">
            {label && <p className="font-medium text-white/90">{label}</p>}
            {value && (
              <MaybeLink lang={lang} url={contactHref(it.icon, value, it.url)} ltr={ltr} className="block text-white/70 hover:text-white break-words tabular">
                {value}
              </MaybeLink>
            )}
          </div>
        </div>
      );
    }
    case "badge":
      return (
        <MaybeLink lang={lang} url={it.url || null} className="flex flex-wrap items-center gap-x-3 gap-y-2 group">
          {pic}
          <span className="min-w-0">
            {label && <span className="block font-medium text-white/90 group-hover:text-white">{label}</span>}
            {value && <span className="block text-white/70 tabular whitespace-nowrap">{value}</span>}
          </span>
        </MaybeLink>
      );
    default:
      return (
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          {pic}
          <div className="min-w-0">
            {label && <p className="font-medium text-white/90">{label}</p>}
            {value && (
              <MaybeLink lang={lang} url={it.url || null} className="block text-white/70 break-words tabular whitespace-pre-line">
                {value}
              </MaybeLink>
            )}
          </div>
        </div>
      );
  }
}

function CustomFooter({ cfg, lang, brand, about, rights }: { cfg: FooterConfig; lang: Locale; brand: Brand; about: string; rights: string }) {
  const pay = cfg.payOn ? cfg.pay.filter((p) => p.on && (p.name || p.img)) : [];
  const cols = cfg.columns.filter((c) => pick(c.title, lang) || c.items.length);
  return (
    <footer className="bg-sign-deep text-white mt-20" data-testid="custom-footer">
      <div className="mx-auto max-w-6xl px-4">
        {cfg.help.on && (pick(cfg.help.title, lang) || pick(cfg.help.button, lang)) && (
          <div className="pt-8">
            <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-amber/25 bg-white/[0.04] p-5 sm:p-6" data-testid="footer-help">
              <span className="grid size-12 place-items-center rounded-full bg-amber text-sign-deep shrink-0">
                <ChatIcon className="size-6" />
              </span>
              <div className="min-w-0 flex-1 basis-60">
                <p className="font-display font-semibold text-lg">{pick(cfg.help.title, lang)}</p>
                {pick(cfg.help.text, lang) && <p className="text-sm text-white/70 mt-1">{pick(cfg.help.text, lang)}</p>}
              </div>
              {pick(cfg.help.button, lang) && (
                <OpenChatButton href={`/${lang}/contact`} className="btn btn-amber !min-h-11 rounded-xl shrink-0">
                  <ChatIcon className="size-4" />
                  {pick(cfg.help.button, lang)}
                </OpenChatButton>
              )}
            </div>
          </div>
        )}
        <div className="py-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(170px,1fr))] text-sm">
          {cfg.showAbout && (
            <div>
              <p className="font-display text-lg font-medium">{brand.name[lang]}</p>
              <p className="text-white/70 mt-2 max-w-xs whitespace-pre-line">{about}</p>
            </div>
          )}
          {cols.map((c) => (
            <section key={c.id} className="min-w-0">
              {pick(c.title, lang) && <h2 className="font-display font-semibold text-[15px] mb-4 text-white">{pick(c.title, lang)}</h2>}
              <div className="space-y-3">
                {c.items.map((it) => (
                  <Item key={it.id} it={it} lang={lang} />
                ))}
              </div>
            </section>
          ))}
        </div>
        {pay.length > 0 && (
          <ul className="flex flex-wrap items-center gap-2 pb-8" aria-label={lang === "ar" ? "طرق الدفع" : "Payment methods"} data-testid="footer-pay-logos">
            {pay.map((p) => (
              <li key={p.id}>
                {p.img ? (
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded logo
                  <img src={footerImg(p.id, p.img)} alt={p.name} title={p.name} loading="lazy" className="h-8 w-auto max-w-24 rounded-md bg-white object-contain px-1.5 py-1" />
                ) : (
                  <span className="inline-grid h-8 place-items-center rounded-md border border-white/25 px-2.5 text-xs font-semibold text-white/85">{p.name}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-white/60">{rights}</p>
      </div>
    </footer>
  );
}

function SimpleFooter({ lang, t, brand }: { lang: Locale; t: Dictionary; brand: Brand }) {
  return (
    <footer className="bg-sign-deep text-white mt-20">
      <div className="mx-auto max-w-6xl px-4 py-12 grid gap-10 md:grid-cols-3">
        <div>
          <p className="font-display text-lg font-medium">{brand.name[lang]}</p>
          <Suspense fallback={<p className="text-sm text-white/70 mt-2 max-w-xs">{t.meta.description}</p>}>
            <FooterAbout lang={lang} t={t} />
          </Suspense>
        </div>
        <Suspense fallback={null}>
          <FooterLinks lang={lang} t={t} />
        </Suspense>
        <Suspense fallback={null}>
          <FooterContact lang={lang} t={t} />
        </Suspense>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-white/60">
          <Suspense fallback={`${t.footer.rights} ${brand.name[lang]}`}>
            <FooterRights lang={lang} t={t} brand={brand} />
          </Suspense>
        </p>
      </div>
    </footer>
  );
}

async function FooterBody({ lang, t, brand }: { lang: Locale; t: Dictionary; brand: Brand }) {
  const st = await getSettings();
  const cfg = parseFooter(st.footer_blocks, st);
  if (!cfg.custom) return <SimpleFooter lang={lang} t={t} brand={brand} />;
  const about = st[`footer_about_${lang}`]?.trim() || t.meta.description;
  const rights = st[`footer_rights_${lang}`]?.trim() || `${t.footer.rights} ${brand.name[lang]}`;
  return <CustomFooter cfg={cfg} lang={lang} brand={brand} about={about} rights={rights} />;
}

export function SiteFooter({ lang, t, brand }: { lang: Locale; t: Dictionary; brand: Brand }) {
  return (
    <Suspense fallback={<SimpleFooter lang={lang} t={t} brand={brand} />}>
      <FooterBody lang={lang} t={t} brand={brand} />
    </Suspense>
  );
}
