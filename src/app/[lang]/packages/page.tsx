import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { getDictionary, type Dictionary, type Locale } from "@/i18n/dictionaries";
import { activePackages } from "@/lib/packages";
import { packageView } from "@/lib/package-view";
import { formatNumber, formatSAR } from "@/lib/format";
import { CheckIcon } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLocale();
  return { title: getDictionary(lang).packages.title };
}

export default async function PackagesPage() {
  const lang = await getLocale();
  const t = getDictionary(lang);
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl md:text-4xl font-semibold">{t.packages.title}</h1>
      <p className="mt-2 text-muted">{t.packages.lead}</p>
      <Suspense fallback={<div className="mt-8 h-96 rounded-xl bg-paper border border-line" />}>
        <List lang={lang} t={t} />
      </Suspense>
    </div>
  );
}

async function List({ lang, t }: { lang: Locale; t: Dictionary }) {
  const rows = await activePackages();
  if (!rows.length) return <p className="mt-8 text-muted">{t.packages.none}</p>;
  const views = await Promise.all(rows.map((p) => packageView(p, lang)));
  return (
    <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="package-list" data-reveal-items>
      {views.map((p) => (
        <li key={p.id} className="lift bg-paper border border-line rounded-2xl p-6 flex flex-col" data-package={p.id}>
          {p.vehicle && <Image src={p.vehicle.image} alt="" width={240} height={100} className="w-full max-w-52 h-auto mx-auto rtl:-scale-x-100" unoptimized />}
          <h2 className="mt-3 text-xl font-semibold">{p.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {[p.vehicle?.name, t.packages.upTo.replace("{n}", formatNumber(p.passengers, lang))].filter(Boolean).join(" · ")}
          </p>
          {p.lines.length > 0 && (
            <ul className="mt-4 space-y-1.5 text-[15px]">
              {p.lines.map((l) => (
                <li key={l} className="flex gap-2">
                  <CheckIcon className="size-4 mt-1 text-sign shrink-0" />
                  {l}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-auto pt-5">
            <p className="font-display text-3xl font-semibold tabular">{formatSAR(p.total, lang)}</p>
            <p className="text-xs text-muted">{t.packages.inclVat}</p>
            <p className="mt-2 inline-block rounded-full bg-sign-soft px-3 py-1 text-sm text-sign font-medium" data-testid="package-installments">
              {p.parts.length > 1 ? `${t.packages.installments.replace("{n}", formatNumber(p.parts.length, lang))} · ${t.packages.each.replace("{a}", formatSAR(p.parts[0], lang))}` : t.packages.oneShot}
            </p>
            <Link href={`/${lang}/packages/${p.id}`} className="btn btn-primary w-full mt-4">
              {t.packages.book}
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
