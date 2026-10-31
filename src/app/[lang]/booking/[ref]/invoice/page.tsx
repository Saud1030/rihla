import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getLocale } from "@/i18n/server";
import type { Locale } from "@/i18n/dictionaries";
import { getBookingByRef } from "@/lib/booking";
import { companyDetails } from "@/lib/company";
import { InvoiceSheet } from "@/components/site/money-document";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLocale();
  return { title: lang === "ar" ? "الفاتورة" : "Invoice", robots: { index: false } };
}

/** The customer's invoice (issued when the trip ends). The secret booking ref is the key. */
export default async function InvoicePage({ params }: PageProps<"/[lang]/booking/[ref]/invoice">) {
  const lang = await getLocale();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 print:p-0">
      <Suspense fallback={<div className="h-96 rounded-xl bg-paper border border-line" />}>
        <View lang={lang} params={params} />
      </Suspense>
    </div>
  );
}

async function View({ lang, params }: { lang: Locale; params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const b = await getBookingByRef(ref);
  if (!b || !b.invoiceNo) notFound();
  return <InvoiceSheet b={b} c={await companyDetails(lang)} lang={lang} />;
}
