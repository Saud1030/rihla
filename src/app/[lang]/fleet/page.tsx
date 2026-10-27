import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { getDictionary, type Dictionary, type Locale } from "@/i18n/dictionaries";
import { getVehicles } from "@/lib/catalog";
import { formatNumber } from "@/lib/format";
import { BagIcon, PersonIcon, CheckIcon } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLocale();
  return { title: getDictionary(lang).fleet.title };
}

export default async function FleetPage() {
  const lang = await getLocale();
  const t = getDictionary(lang);
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl md:text-4xl font-semibold">{t.fleet.title}</h1>
      <p className="mt-2 text-muted">{t.fleet.lead}</p>
      <Suspense fallback={<div className="mt-8 h-96 rounded-xl bg-paper border border-line" />}>
        <FleetList lang={lang} t={t} />
      </Suspense>
    </div>
  );
}

async function FleetList({ lang, t }: { lang: Locale; t: Dictionary }) {
  const vehicles = await getVehicles();
  return (
    <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {vehicles.map((v) => (
        <li key={v.id} className="bg-paper border border-line rounded-xl p-5 flex flex-col">
          <Image src={v.imageUrl ?? `/vehicles/${v.category}.svg`} alt="" width={240} height={100} className="w-full max-w-60 h-auto mx-auto rtl:-scale-x-100" unoptimized />
          <h2 className="mt-4 text-lg font-semibold">{lang === "ar" ? v.nameAr : v.nameEn}</h2>
          <p className="text-sm text-muted">{t.fleet.category[v.category]}</p>
          <p className="mt-3 flex gap-5 tabular">
            <span className="inline-flex items-center gap-1.5">
              <PersonIcon className="size-5 text-sign" /> {formatNumber(v.passengers, lang)} {t.route.passengers}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <BagIcon className="size-5 text-sign" /> {formatNumber(v.bags, lang)} {t.route.bags}
            </span>
          </p>
          {v.features.length > 0 && (
            <ul className="mt-3 grid grid-cols-2 gap-1 text-sm text-muted">
              {v.features.map((f) => (
                <li key={f.en} className="inline-flex items-center gap-1.5">
                  <CheckIcon className="size-3.5 text-sign" />
                  {f[lang]}
                </li>
              ))}
            </ul>
          )}
          <Link href={`/${lang}/routes?vehicle=${v.category}`} className="btn btn-ghost mt-auto pt-2 !mt-5">
            {t.fleet.seeRoutes}
          </Link>
        </li>
      ))}
    </ul>
  );
}
