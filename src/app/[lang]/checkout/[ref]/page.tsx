import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getLocale } from "@/i18n/server";
import { getDictionary, type Dictionary, type Locale } from "@/i18n/dictionaries";
import { getBookingByRef } from "@/lib/booking";
import { getBankConfig, getSettings } from "@/lib/catalog";
import { isGatewayConfigured } from "@/lib/myfatoorah";
import { formatSAR } from "@/lib/format";
import { chooseBankTransfer, startPayment } from "@/app/actions/payment";
import { BookingSummary } from "@/components/site/booking-summary";
import { PayButton } from "@/components/site/pay-button";
import { LockIcon } from "@/components/icons";
import type { Booking } from "@/db/schema";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLocale();
  return { title: getDictionary(lang).checkout.title, robots: { index: false } };
}

export default async function CheckoutPage({ params }: PageProps<"/[lang]/checkout/[ref]">) {
  const lang = await getLocale();
  const t = getDictionary(lang);
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-semibold mb-8">{t.checkout.title}</h1>
      <Suspense fallback={<div className="h-96 rounded-xl bg-paper border border-line" />}>
        <Checkout lang={lang} t={t} params={params} />
      </Suspense>
    </div>
  );
}

async function Checkout({ lang, t, params }: { lang: Locale; t: Dictionary; params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const [b, settings] = await Promise.all([getBookingByRef(ref), getSettings()]);
  if (!b) notFound();

  const payable = b.status === "pending_payment";

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_400px] items-start">
      <section aria-label={t.checkout.summary}>
        <BookingSummary b={b} lang={lang} t={t} vatNumber={settings.vat_number} />
      </section>

      <section className="bg-paper border border-line rounded-xl p-5">
        {!payable ? (
          <div className="text-center py-6">
            <p className="font-semibold">{b.status === "cancelled" ? t.checkout.cancelled : t.checkout.alreadyPaid}</p>
            <Link href={`/${lang}/booking/${b.ref}`} className="btn btn-primary mt-4">
              {t.checkout.viewBooking}
            </Link>
          </div>
        ) : (
          <PaymentOptions b={b} lang={lang} t={t} />
        )}
      </section>
    </div>
  );
}

/** Only two ways to pay: MyFatoorah's hosted page, or a bank transfer the admin confirms. */
async function PaymentOptions({ b, lang, t }: { b: Booking; lang: Locale; t: Dictionary }) {
  const bank = await getBankConfig();
  const mf = isGatewayConfigured();
  if (!mf && !bank) return <p className="text-danger bg-danger-soft rounded-md p-4 text-sm">{t.checkout.notConfigured}</p>;
  return (
    <div>
      <h2 className="font-semibold flex items-center gap-2">
        <LockIcon className="size-4 text-sign" />
        {t.checkout.payTitle}
      </h2>
      {mf && (
        <div className="mt-4" data-method="myfatoorah">
          <h3 className="font-medium">{t.checkout.mfTitle}</h3>
          <p className="mt-1 mb-3 text-sm text-muted">{t.checkout.payLead}</p>
          <PayButton
            action={startPayment.bind(null, b.ref, lang)}
            labels={{
              pay: `${t.checkout.pay} ${formatSAR(b.amount, lang)}`,
              redirecting: t.checkout.redirecting,
              gatewayError: t.checkout.gatewayError,
              notConfigured: t.checkout.notConfigured,
            }}
          />
          <p className="mt-3 text-xs text-muted">{t.checkout.secure}</p>
        </div>
      )}
      {mf && bank && (
        <div className="my-5 flex items-center gap-3 text-sm text-muted" aria-hidden="true">
          <span className="h-px flex-1 bg-line" />
          {t.checkout.or}
          <span className="h-px flex-1 bg-line" />
        </div>
      )}
      {bank && (
        <div className={mf ? "" : "mt-4"} data-method="bank_transfer">
          <h3 className="font-medium">{t.checkout.bankTitle}</h3>
          <p className="mt-1 mb-3 text-sm text-muted">{t.checkout.bankLead}</p>
          {b.paymentMethod === "bank_transfer" && <p className="mb-3 text-sm bg-sign-soft rounded-md px-3 py-2">{t.checkout.bankChosen}</p>}
          <form action={chooseBankTransfer.bind(null, b.ref, lang)}>
            <button type="submit" className="btn btn-ghost w-full">
              {t.checkout.bankChoose}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
