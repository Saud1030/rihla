import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { TripSearch } from "@/components/site/trip-search";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLocale();
  return { title: getDictionary(lang).routes.title };
}

/** Routes & prices: choose from / to (or hourly) and the date, then the prices of every vehicle are shown. */
export default async function RoutesPage() {
  const lang = await getLocale();
  const t = getDictionary(lang);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl md:text-4xl font-semibold">{t.routes.title}</h1>
      <p className="mt-2 text-muted max-w-[60ch]">
        {t.routes.pickLead} {t.routes.lead}
      </p>
      <div className="sign mt-8 p-6 md:p-7 max-w-2xl">
        <Suspense
          fallback={
            <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
              <div className="h-[72px] rounded-lg bg-white/10" />
              <div className="h-[72px] rounded-lg bg-white/10" />
              <div className="h-[46px] rounded-lg bg-amber/60 sm:col-span-2" />
            </div>
          }
        >
          <TripSearch lang={lang} t={t} id="routes-search" />
        </Suspense>
      </div>
    </div>
  );
}
