import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { getDictionary, type Dictionary, type Locale } from "@/i18n/dictionaries";
import { getVehicles } from "@/lib/catalog";
import { modelYears } from "@/lib/driver-docs";
import { DriverJoinForm } from "@/components/site/driver-join-form";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLocale();
  return { title: getDictionary(lang).join.title };
}

export default async function DriverJoinPage() {
  const lang = await getLocale();
  const t = getDictionary(lang);
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl md:text-4xl font-semibold">{t.join.title}</h1>
      <p className="mt-2 text-muted max-w-[65ch]">{t.join.lead}</p>
      <div className="mt-8">
        <Suspense fallback={<div className="h-96 rounded-xl bg-paper border border-line" />}>
          <Form lang={lang} t={t} />
        </Suspense>
      </div>
    </div>
  );
}

async function Form({ lang, t }: { lang: Locale; t: Dictionary }) {
  const vehicles = await getVehicles();
  return (
    <DriverJoinForm
      lang={lang}
      t={t.join}
      vehicles={vehicles.map((v) => ({ id: v.id, name: lang === "ar" ? v.nameAr : v.nameEn }))}
      years={modelYears()}
    />
  );
}
