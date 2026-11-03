import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { getLocale } from "@/i18n/server";
import type { Locale } from "@/i18n/dictionaries";
import { getBookingByRef } from "@/lib/booking";
import { companyDetails } from "@/lib/company";
import { TransferSlipSheet } from "@/components/site/money-document";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLocale();
  return { title: lang === "ar" ? "إشعار تحويل بنكي" : "Bank transfer notice", robots: { index: false } };
}

/** Ready for the customer as soon as the transfer receipt is uploaded. The secret booking ref is the key. */
export default async function TransferSlipPage({ params }: PageProps<"/[lang]/booking/[ref]/transfer">) {
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
  if (!b || b.paymentMethod !== "bank_transfer") notFound();
  const uploads = await db
    .select({ fileName: s.receipts.fileName, createdAt: s.receipts.createdAt })
    .from(s.receipts)
    .where(eq(s.receipts.bookingId, b.id))
    .orderBy(asc(s.receipts.createdAt));
  if (!uploads.length) notFound();
  return <TransferSlipSheet b={b} c={await companyDetails(lang)} lang={lang} uploads={uploads} />;
}
