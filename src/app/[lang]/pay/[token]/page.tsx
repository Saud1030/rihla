import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { getLocale } from "@/i18n/server";
import { getDictionary, type Dictionary, type Locale } from "@/i18n/dictionaries";
import { installmentsOf } from "@/lib/packages";
import { formatDate, formatNumber, formatSAR, formatTime } from "@/lib/format";
import { payInstallment } from "@/app/actions/package";
import { PayButton } from "@/components/site/pay-button";
import { CheckIcon } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLocale();
  return { title: getDictionary(lang).checkout.title, robots: { index: false } };
}

/** The link of one installment (the first right after booking a package; the others are sent by the admin) */
export default async function InstallmentPage({ params }: PageProps<"/[lang]/pay/[token]">) {
  const lang = await getLocale();
  const t = getDictionary(lang);
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <Suspense fallback={<div className="h-96 rounded-xl bg-paper border border-line" />}>
        <View lang={lang} t={t} params={params as Promise<{ token: string }>} />
      </Suspense>
    </div>
  );
}

async function View({ lang, t, params }: { lang: Locale; t: Dictionary; params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) notFound();
  const inst = await db.query.installments.findFirst({ where: eq(s.installments.token, token) });
  if (!inst) notFound();
  const [b, all] = await Promise.all([db.query.bookings.findFirst({ where: eq(s.bookings.id, inst.bookingId) }), installmentsOf(inst.bookingId)]);
  if (!b) notFound();
  const n = (x: number) => formatNumber(x, lang);
  const title = t.packages.payTitle.replace("{k}", n(inst.seq)).replace("{n}", n(all.length));
  return (
    <div className="bg-paper border border-line rounded-xl p-6 space-y-5" data-testid="installment-pay">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-muted">
          {b.routeTitle} · {formatDate(b.pickupDate, lang)} · {formatTime(b.pickupTime, lang)}
        </p>
        <p className="mt-1 text-sm text-muted" dir="ltr" style={{ textAlign: lang === "ar" ? "right" : "left" }}>
          {b.ref}
        </p>
      </div>
      <ol className="divide-y divide-line border border-line rounded-lg text-[15px]" data-testid="installment-list">
        {all.map((x) => (
          <li key={x.id} className={`flex items-center justify-between px-4 py-2.5 ${x.id === inst.id ? "bg-sign-soft" : ""}`} data-paid={x.paidAt ? "1" : "0"}>
            <span>{t.packages.payment.replace("{k}", n(x.seq)).replace("{n}", n(all.length))}</span>
            <span className="flex items-center gap-3 tabular">
              {formatSAR(x.amount, lang)}
              <span className={`text-xs rounded-md px-2 py-0.5 ${x.paidAt ? "bg-sign-soft text-sign" : "bg-stone text-muted"}`}>{x.paidAt ? t.packages.paidMark : t.packages.dueMark}</span>
            </span>
          </li>
        ))}
      </ol>
      {inst.paidAt ? (
        <p className="flex items-center gap-2 font-medium text-sign" role="status">
          <CheckIcon className="size-5" />
          {t.packages.paidDone}
        </p>
      ) : b.status === "cancelled" ? (
        <p className="text-danger">{t.checkout.cancelled}</p>
      ) : (
        <PayButton
          action={payInstallment.bind(null, token, lang)}
          labels={{ pay: `${t.checkout.pay} ${formatSAR(inst.amount, lang)}`, redirecting: t.checkout.redirecting, gatewayError: t.checkout.gatewayError, notConfigured: t.checkout.notConfigured }}
        />
      )}
      <Link href={`/${lang}/booking/${b.ref}`} className="block text-sm text-sign hover:underline">
        {t.packages.viewBooking}
      </Link>
    </div>
  );
}
