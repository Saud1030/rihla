import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { getLocale } from "@/i18n/server";
import { getDictionary, type Dictionary, type Locale } from "@/i18n/dictionaries";
import { getSettings } from "@/lib/catalog";
import { maxBookingDate, todayInRiyadh } from "@/lib/booking";
import { parseLeadHours } from "@/lib/lead-time";
import { countryOptions } from "@/lib/countries";
import { packageView } from "@/lib/package-view";
import { formatNumber, formatSAR } from "@/lib/format";
import { createPackageBooking } from "@/app/actions/package";
import { PackageForm } from "@/components/site/package-form";
import { CheckIcon } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLocale();
  return { title: getDictionary(lang).packages.book };
}

export default async function PackagePage({ params }: PageProps<"/[lang]/packages/[id]">) {
  const lang = await getLocale();
  const t = getDictionary(lang);
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href={`/${lang}/packages`} className="text-sm text-sign hover:underline">
        {t.packages.title}
      </Link>
      <Suspense fallback={<div className="mt-6 h-96 rounded-xl bg-paper border border-line" />}>
        <View lang={lang} t={t} params={params as Promise<{ id: string }>} />
      </Suspense>
    </div>
  );
}

async function View({ lang, t, params }: { lang: Locale; t: Dictionary; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) notFound();
  const row = await db.query.packages.findFirst({ where: and(eq(s.packages.id, Number(id)), eq(s.packages.active, true)) });
  if (!row) notFound();
  const [p, st] = await Promise.all([packageView(row, lang), getSettings()]);
  return (
    <div className="mt-4 grid gap-8 md:grid-cols-[1fr_340px] items-start">
      <section>
        <h1 className="text-3xl font-semibold">{p.name}</h1>
        <div className="mt-6 bg-paper border border-line rounded-xl p-5">
          <PackageForm
            lang={lang}
            t={t}
            action={createPackageBooking.bind(null, lang, row.id)}
            minDate={todayInRiyadh()}
            maxDate={maxBookingDate()}
            maxPassengers={p.passengers}
            leadHours={parseLeadHours(st.min_lead_hours)}
            countries={countryOptions(lang)}
            firstNote={t.packages.firstNow.replace("{a}", formatSAR(p.parts[0], lang))}
          />
        </div>
      </section>
      <aside className="bg-paper border border-line rounded-xl p-5 md:sticky md:top-24" data-testid="package-summary">
        {p.lines.length > 0 && (
          <ul className="space-y-1.5 text-[15px] mb-4">
            {p.lines.map((l) => (
              <li key={l} className="flex gap-2">
                <CheckIcon className="size-4 mt-1 text-sign shrink-0" />
                {l}
              </li>
            ))}
          </ul>
        )}
        <dl className="space-y-1.5 text-[15px] tabular border-t border-line pt-4">
          <div className="flex justify-between">
            <dt className="text-muted">{t.packages.total}</dt>
            <dd className="font-display text-xl font-semibold">{formatSAR(p.total, lang)}</dd>
          </div>
          {p.parts.map((a, i) => (
            <div key={i} className="flex justify-between text-sm" data-testid="package-part">
              <dt className="text-muted">{t.packages.payment.replace("{k}", formatNumber(i + 1, lang)).replace("{n}", formatNumber(p.parts.length, lang))}</dt>
              <dd>{formatSAR(a, lang)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted">{t.packages.inclVat}</p>
      </aside>
    </div>
  );
}
