import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getLocale } from "@/i18n/server";
import { getDictionary, type Dictionary, type Locale } from "@/i18n/dictionaries";
import { getBookingByRef, normalizeRef } from "@/lib/booking";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLocale();
  return { title: getDictionary(lang).booking.lookupTitle };
}

export default async function LookupPage({ searchParams }: PageProps<"/[lang]/booking">) {
  const lang = await getLocale();
  const t = getDictionary(lang);
  return (
    <div className="mx-auto max-w-lg px-4 py-14">
      <h1 className="text-3xl font-semibold">{t.booking.lookupTitle}</h1>
      <p className="mt-2 text-muted">{t.booking.lookupLead}</p>
      <Suspense fallback={<LookupForm t={t} />}>
        <Lookup lang={lang} t={t} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Lookup({ lang, t, searchParams }: { lang: Locale; t: Dictionary; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ref = typeof sp.ref === "string" ? normalizeRef(sp.ref) : "";
  if (ref) {
    const b = await getBookingByRef(ref);
    if (b) redirect(`/${lang}/booking/${b.ref}`);
  }
  return <LookupForm t={t} value={ref} notFound={!!ref} />;
}

function LookupForm({ t, value = "", notFound = false }: { t: Dictionary; value?: string; notFound?: boolean }) {
  return (
    <form method="get" className="mt-6">
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="ref">{t.checkout.ref}</label>
        <input
          id="ref"
          name="ref"
          defaultValue={value}
          required
          dir="ltr"
          autoCapitalize="characters"
          placeholder="ABCD2345"
          className="field font-display tracking-widest uppercase text-center"
          aria-invalid={notFound || undefined}
          aria-describedby={notFound ? "ref-error" : undefined}
        />
        <button type="submit" className="btn btn-primary shrink-0">{t.booking.lookup}</button>
      </div>
      {notFound && (
        <p id="ref-error" className="text-danger text-sm mt-2" role="alert">
          {t.booking.notFound}
        </p>
      )}
    </form>
  );
}
