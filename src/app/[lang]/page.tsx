import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { getDictionary, type Dictionary, type Locale } from "@/i18n/dictionaries";
import { getHomeBanners, getSettings, getVehicles } from "@/lib/catalog";
import { BannerSlider } from "@/components/site/banner-slider";
import { getBrand, getHeroBackground } from "@/lib/brand";
import { TripSearch } from "@/components/site/trip-search";
import { HeroSlides } from "@/components/site/hero-slides";
import { formatNumber } from "@/lib/format";
import { PersonIcon, BagIcon, WhatsAppIcon, PhoneIcon } from "@/components/icons";
import { waLink } from "@/components/site/whatsapp-fab";
import { ReviewsSection } from "@/components/site/reviews-section";

export default async function HomePage() {
  const lang = await getLocale();
  const t = getDictionary(lang);

  return (
    <>
      {/* Hero, with an optional background image set in the admin panel */}
      <section className="relative isolate overflow-hidden bg-paper border-b border-line">
        <Suspense fallback={null}>
          <HeroBackground />
        </Suspense>
        {/* wide screens: the text on one side, the booking box as a tall panel on the left; phones: text, then the box */}
        <div
          className={`relative mx-auto max-w-6xl px-4 py-8 md:py-12 grid gap-6 lg:items-center lg:gap-10 ${lang === "ar" ? "lg:grid-cols-[minmax(0,1fr)_23rem]" : "lg:grid-cols-[23rem_minmax(0,1fr)]"}`}
        >
          <Suspense
            fallback={
              <div>
                <h1 className="text-3xl md:text-[2.6rem] leading-tight font-semibold max-w-[18ch]">{t.hero.title}</h1>
                <p className="mt-5 text-lg text-muted max-w-[52ch]">{t.hero.lead}</p>
              </div>
            }
          >
            <HeroText lang={lang} t={t} />
          </Suspense>

          <div className={`booking-box sign-reveal p-4 md:p-5 w-full max-w-[50rem] lg:min-h-[30rem] ${lang === "ar" ? "" : "lg:order-first"}`} data-testid="booking-box">
            <Suspense fallback={<SearchFormSkeleton />}>
              <TripSearch lang={lang} t={t} id="search" />
            </Suspense>
          </div>
        </div>
      </section>

      {/* Banners added from the admin panel (nothing shows until there is one) */}
      <Suspense fallback={null}>
        <HomeBanners lang={lang} t={t} />
      </Suspense>

      {/* Fleet by group size */}
      <section className="mx-auto max-w-6xl px-4 pt-16">
        <h2 className="text-2xl md:text-3xl font-semibold mb-6">{t.home.fleetTitle}</h2>
        <Suspense fallback={<div className="h-44 rounded-xl bg-paper border border-line" />}>
          <FleetStrip lang={lang} t={t} />
        </Suspense>
      </section>

      {/* How it works: a real sequence, so it's numbered */}
      <section className="mx-auto max-w-6xl px-4 pt-16">
        <h2 className="text-2xl md:text-3xl font-semibold mb-6">{t.home.howTitle}</h2>
        <ol className="grid gap-px bg-line border border-line rounded-xl overflow-hidden sm:grid-cols-2 lg:grid-cols-4">
          {t.home.steps.map((s, i) => (
            <li key={s.t} className="bg-paper p-5">
              <span className="grid place-items-center size-8 rounded-md bg-sign text-white font-display font-semibold tabular">
                {formatNumber(i + 1, lang)}
              </span>
              <h3 className="mt-4 font-semibold text-[17px]">{s.t}</h3>
              <p className="mt-1 text-muted text-[15px]">{s.d}</p>
            </li>
          ))}
        </ol>
        <dl className="mt-8 grid gap-6 sm:grid-cols-3">
          {t.home.trust.map((x) => (
            <div key={x.t} className="border-s-4 border-amber ps-4">
              <dt className="font-semibold">{x.t}</dt>
              <dd className="text-muted text-[15px]">{x.d}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Customer ratings */}
      <Suspense fallback={null}>
        <ReviewsSection lang={lang} t={t} />
      </Suspense>

      {/* Contact */}
      <section className="mx-auto max-w-6xl px-4 pt-16">
        <Suspense fallback={null}>
          <ContactBand t={t} />
        </Suspense>
      </section>
    </>
  );
}

async function HeroText({ lang, t }: { lang: Locale; t: Dictionary }) {
  const { hero } = await getBrand();
  // set in Admin -> Appearance: the default text, the admin's own text, or none
  if (hero.mode === "hidden") return <h1 className="sr-only">{t.hero.title}</h1>;
  const title = hero.mode === "custom" ? hero.title[lang] || hero.title.ar : t.hero.title;
  const lead = hero.mode === "custom" ? hero.lead[lang] || (lang === "ar" ? "" : hero.lead.ar) : t.hero.lead;
  return (
    <div data-testid="hero-text">
      <h1 className="text-3xl md:text-[2.6rem] leading-tight font-semibold max-w-[18ch]">{title}</h1>
      {lead && <p className="mt-4 text-lg text-muted max-w-[52ch]">{lead}</p>}
    </div>
  );
}

function SearchFormSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
      <div className="h-[72px] rounded-lg bg-white/10" />
      <div className="h-[72px] rounded-lg bg-white/10" />
      <div className="h-[46px] rounded-lg bg-amber/60 sm:col-span-2" />
    </div>
  );
}

async function FleetStrip({ lang, t }: { lang: Locale; t: Dictionary }) {
  const vehicles = await getVehicles();
  // one representative per category, smallest first
  const seen = new Set<string>();
  const reps = vehicles.filter((v) => (seen.has(v.category) ? false : (seen.add(v.category), true)));
  return (
    <ul className="grid gap-3 grid-cols-2 md:grid-cols-5">
      {reps.map((v) => (
        <li key={v.id}>
          <Link
            href={`/${lang}/fleet`}
            className="block h-full bg-paper border border-line rounded-xl p-4 hover:border-sign"
          >
            <Image src={v.imageUrl ?? `/vehicles/${v.category}.svg`} alt="" width={240} height={100} className="w-full h-auto rtl:-scale-x-100" unoptimized />
            <p className="mt-3 font-semibold">{t.fleet.category[v.category]}</p>
            <p className="text-sm text-muted flex gap-3 tabular">
              <span className="inline-flex items-center gap-1">
                <PersonIcon className="size-4" />
                {formatNumber(v.passengers, lang)}
              </span>
              <span className="inline-flex items-center gap-1">
                <BagIcon className="size-4" />
                {formatNumber(v.bags, lang)}
              </span>
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function ContactBand({ t }: { t: Dictionary }) {
  const s = await getSettings();
  return (
    <div className="rounded-xl bg-sign-soft border border-sign/15 p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-5">
      <div className="flex-1">
        <h2 className="text-xl md:text-2xl font-semibold">{t.home.contactTitle}</h2>
        <p className="text-muted mt-1">{t.home.contactLead}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {s.whatsapp && (
          <a href={waLink(s.whatsapp)} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
            <WhatsAppIcon className="size-5" />
            {t.home.whatsapp}
          </a>
        )}
        {s.phone && (
          <a href={`tel:${s.phone}`} className="btn btn-ghost">
            <PhoneIcon className="size-5" />
            {t.home.call}
          </a>
        )}
      </div>
    </div>
  );
}

async function HomeBanners({ lang, t }: { lang: Locale; t: Dictionary }) {
  const [banners, st] = await Promise.all([getHomeBanners(), getSettings()]);
  if (!banners.length) return null;
  const pick = (ar: string, en: string) => (lang === "ar" ? ar || en : en || ar);
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10">
      <BannerSlider
        labels={t.home.banners}
        autoplay={st.banners_autoplay !== "0"}
        effect={st.banners_effect === "fade" ? "fade" : "slide"}
        seconds={Math.min(30, Math.max(3, Number(st.banners_seconds) || 6))}
        rtl={lang === "ar"}
        slides={banners.map((b) => ({
          id: b.id,
          src: `/api/banners/${b.id}?v=${b.updatedAt.getTime()}`,
          title: pick(b.titleAr, b.titleEn),
          text: pick(b.textAr, b.textEn),
          link: b.link,
          external: /^https?:/.test(b.link),
        }))}
      />
    </div>
  );
}

/** The photo behind the top section; a light veil keeps the headline readable */
async function HeroBackground() {
  const bg = await getHeroBackground();
  if (!bg) return null;
  // the photos exactly as uploaded: no veil, no zoom, full resolution and colours
  return (
    <div className="absolute inset-0 -z-10" aria-hidden="true" data-testid="hero-bg">
      <HeroSlides urls={bg.images.map((x) => x.url)} animate={bg.animate} seconds={bg.seconds} />
    </div>
  );
}
