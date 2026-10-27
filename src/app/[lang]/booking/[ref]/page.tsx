import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getLocale } from "@/i18n/server";
import { getDictionary, type Dictionary, type Locale } from "@/i18n/dictionaries";
import { getBookingByRef } from "@/lib/booking";
import { getBankConfig, getSettings } from "@/lib/catalog";
import { formatDateTime, formatNumber, formatSAR } from "@/lib/format";
import { cancelQuote, parseCancelPolicy } from "@/lib/policy";
import { cancelByCustomer } from "@/app/actions/cancel";
import { CancelForm } from "@/components/site/cancel-form";
import { BankDetails } from "@/components/site/bank-details";
import { BookingSummary } from "@/components/site/booking-summary";
import { ReceiptUpload } from "@/components/site/receipt-upload";
import { uploadReceipt } from "@/app/actions/receipt";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { waLink } from "@/components/site/whatsapp-fab";
import { CheckIcon, WhatsAppIcon, XIcon } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLocale();
  return { title: getDictionary(lang).booking.title, robots: { index: false } };
}

export default async function BookingPage({ params, searchParams }: PageProps<"/[lang]/booking/[ref]">) {
  const lang = await getLocale();
  const t = getDictionary(lang);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Suspense fallback={<div className="h-96 rounded-xl bg-paper border border-line" />}>
        <BookingView lang={lang} t={t} params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function BookingView({
  lang,
  t,
  params,
  searchParams,
}: {
  lang: Locale;
  t: Dictionary;
  params: Promise<{ ref: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ ref }, sp] = await Promise.all([params, searchParams]);
  const [b, settings, bank] = await Promise.all([getBookingByRef(ref), getSettings(), getBankConfig()]);
  if (!b) notFound();

  const isPaid = b.status === "paid" || b.status === "confirmed" || b.status === "completed";
  const pending = !isPaid && b.status === "pending_payment";
  const failed = pending && sp.result === "failed";
  const verifying = pending && sp.result === "verifying";
  const pid = typeof sp.pid === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(sp.pid) ? sp.pid : null;
  const waText = lang === "ar" ? `السلام عليكم، رقم حجزي ${b.ref}` : `Hello, my booking number is ${b.ref}`;
  const policy = parseCancelPolicy(settings);
  const quote = cancelQuote(b, policy);
  const fill = (tpl: string, v: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

  return (
    <>
      {b.status === "cancelled" ? (
        <div className="rounded-xl border border-line bg-paper p-6 mb-8" role="status">
          <h1 className="text-2xl font-semibold">{t.booking.cancelledTitle}</h1>
          {b.cancelledAt && <p className="text-sm text-muted mt-1">{formatDateTime(b.cancelledAt, lang)}</p>}
          {b.paymentId && (
            <div className="mt-4 space-y-1">
              {b.refundAmount > 0 && <p className="font-semibold">{fill(t.booking.refundLine, { amount: formatSAR(b.refundAmount, lang) })}</p>}
              <p className="text-muted">
                {b.paymentMethod === "bank_transfer" && b.refundStatus === "pending_approval" ? t.booking.refundBank : t.booking.refundStatus[b.refundStatus]}
              </p>
              {b.refundReference && b.refundStatus === "requested" && (
                <p className="text-sm text-muted">
                  {t.booking.refundRef}: <span dir="ltr">{b.refundReference}</span>
                </p>
              )}
            </div>
          )}
        </div>
      ) : isPaid ? (
        <div className="sign p-6 md:p-7 mb-8 flex gap-4 items-start">
          <span className="grid place-items-center size-10 rounded-full bg-white text-sign shrink-0">
            <CheckIcon className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold">{t.booking.paidTitle}</h1>
            <p className="text-white/85 mt-1">{b.driverId && b.status === "confirmed" ? t.driver.ready : t.booking.paidLead}</p>
            {b.paidAt && (
              <p className="text-white/70 text-sm mt-2">
                {t.booking.paidAt}: {formatDateTime(b.paidAt, lang)}
              </p>
            )}
          </div>
        </div>
      ) : failed ? (
        <div className="rounded-xl border border-danger/30 bg-danger-soft p-6 mb-8 flex gap-4 items-start" role="alert">
          <span className="grid place-items-center size-10 rounded-full bg-danger text-white shrink-0">
            <XIcon className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold">{t.booking.failedTitle}</h1>
            <p className="mt-1">{t.booking.failedLead}</p>
            <Link href={`/${lang}/checkout/${b.ref}`} className="btn btn-primary mt-4">
              {t.booking.retry}
            </Link>
          </div>
        </div>
      ) : verifying ? (
        <div className="rounded-xl border border-amber bg-amber/15 p-6 mb-8" role="status">
          <h1 className="text-2xl font-semibold">{t.booking.verifyingTitle}</h1>
          <p className="mt-1">{t.booking.verifyingLead}</p>
          <a
            href={pid ? `/api/payments/callback?ref=${b.ref}&lang=${lang}&paymentId=${pid}` : `/${lang}/booking/${b.ref}`}
            className="btn btn-primary mt-4"
          >
            {t.booking.refresh}
          </a>
        </div>
      ) : pending && b.paymentMethod === "bank_transfer" && bank ? (
        <div className="rounded-xl border border-amber bg-paper p-6 mb-8" data-testid="bank-transfer">
          <h1 className="text-2xl font-semibold">{t.booking.bankTitle}</h1>
          <p className="mt-1 mb-4 text-muted">{t.booking.bankLead}</p>
          <BankDetails bank={bank} amount={formatSAR(b.amount, lang)} refCode={b.ref} labels={t.checkout.bank} />
          <Receipts bookingId={b.id} justUploaded={sp.receipt === "1"} lang={lang} t={t} />
          <div className="mt-5 pt-5 border-t border-line">
            <ReceiptUpload
              action={uploadReceipt.bind(null, b.ref, lang)}
              labels={t.booking.receipt}
              again={(await receiptCount(b.id)) > 0}
            />
          </div>
          <div className="mt-4">
            <Link href={`/${lang}/checkout/${b.ref}`} className="text-sm text-sign hover:underline underline-offset-4">
              {t.booking.otherMethod}
            </Link>
          </div>
        </div>
      ) : (
        <div className="mb-8">
          <h1 className="text-3xl font-semibold">{b.status === "pending_payment" ? t.booking.pendingTitle : t.booking.title}</h1>
          {b.status === "pending_payment" && (
            <Link href={`/${lang}/checkout/${b.ref}`} className="btn btn-primary mt-4">
              {t.booking.pay}
            </Link>
          )}
        </div>
      )}

      {(b.status === "confirmed" || b.status === "completed") && b.driverId && <DriverCard bookingRef={b.ref} driverId={b.driverId} t={t} />}

      <BookingSummary b={b} lang={lang} t={t} vatNumber={settings.vat_number} />

      {(b.status === "paid" || b.status === "confirmed") && policy.enabled && (
        <section className="mt-8 rounded-xl border border-line bg-paper p-5" aria-labelledby="cancel-title">
          <h2 id="cancel-title" className="font-semibold text-lg">
            {t.booking.cancelTitle}
          </h2>
          {quote.allowed ? (
            <>
              <p className="mt-1 mb-4 text-muted">
                {quote.refund === 0
                  ? t.booking.cancelNone
                  : quote.full
                    ? fill(t.booking.cancelFull, { amount: formatSAR(quote.refund, lang) })
                    : fill(t.booking.cancelPartial, {
                        amount: formatSAR(quote.refund, lang),
                        hours: formatNumber(policy.fullHours, lang),
                        percent: formatNumber(policy.partialPercent, lang),
                      })}
              </p>
              <CancelForm
                action={cancelByCustomer.bind(null, b.ref, lang)}
                labels={{
                  open: t.booking.cancelOpen,
                  phone: t.booking.cancelPhone,
                  phoneHint: t.booking.cancelPhoneHint,
                  confirm: t.booking.cancelConfirm,
                  submit: t.booking.cancelSubmit,
                  sending: t.booking.cancelSending,
                  keep: t.booking.cancelKeep,
                  errors: t.booking.cancelErrors,
                }}
              />
            </>
          ) : (
            <p className="mt-1 text-muted">{t.booking.cancelStarted}</p>
          )}
        </section>
      )}

      {settings.whatsapp && isPaid && (
        <a href={waLink(settings.whatsapp, waText)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost mt-6">
          <WhatsAppIcon className="size-5 text-[#1f9d55]" />
          {t.booking.whatsapp}
        </a>
      )}
    </>
  );
}

async function receiptCount(bookingId: string) {
  const rows = await db.select({ id: s.receipts.id }).from(s.receipts).where(eq(s.receipts.bookingId, bookingId));
  return rows.length;
}

/** Receipts the customer already sent (names and times only; the files themselves are admin-only) */
async function Receipts({ bookingId, justUploaded, lang, t }: { bookingId: string; justUploaded: boolean; lang: Locale; t: Dictionary }) {
  const rows = await db
    .select({ id: s.receipts.id, fileName: s.receipts.fileName, createdAt: s.receipts.createdAt })
    .from(s.receipts)
    .where(eq(s.receipts.bookingId, bookingId))
    .orderBy(asc(s.receipts.createdAt));
  if (!rows.length) return null;
  return (
    <div className="mt-5 rounded-lg bg-sign-soft border border-sign/15 p-4" role={justUploaded ? "status" : undefined} data-testid="receipts">
      <p className="font-medium flex items-center gap-2">
        <CheckIcon className="size-4 text-sign" />
        {t.booking.receipt.received}
      </p>
      <ul className="mt-2 space-y-1 text-sm text-muted">
        {rows.map((r) => (
          <li key={r.id}>
            <bdi>{r.fileName}</bdi> · {formatDateTime(r.createdAt, lang)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The assigned driver, shown to the customer (photo, name, car, plate, contact) */
async function DriverCard({ bookingRef, driverId, t }: { bookingRef: string; driverId: number; t: Dictionary }) {
  const [d] = await db
    .select({
      name: s.drivers.name,
      phone: s.drivers.phone,
      plateNumber: s.drivers.plateNumber,
      carType: s.drivers.carType,
      carModel: s.drivers.carModel,
      carColor: s.drivers.carColor,
      hasPhoto: sql<boolean>`${s.drivers.photo} is not null`,
    })
    .from(s.drivers)
    .where(eq(s.drivers.id, driverId))
    .limit(1);
  if (!d) return null;
  return (
    <section className="mb-6 rounded-xl border-2 border-sign/30 bg-paper p-5" aria-labelledby="driver-title" data-testid="customer-driver">
      <h2 id="driver-title" className="font-semibold text-lg mb-4">
        {t.driver.title}
      </h2>
      <div className="flex flex-wrap items-center gap-4">
        {d.hasPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- private photo from our own API route
          <img src={`/api/booking/${bookingRef}/driver-photo`} alt={d.name} className="size-24 rounded-2xl object-cover bg-stone" />
        ) : (
          <div className="size-24 rounded-2xl grid place-items-center bg-sign-soft text-sign font-display text-3xl font-semibold" aria-hidden>
            {d.name.trim().charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xl font-semibold">{d.name}</p>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-[15px]">
            <dt className="text-muted">{t.driver.car}</dt>
            <dd>{[d.carType, d.carModel, d.carColor].filter(Boolean).join(" · ")}</dd>
            <dt className="text-muted">{t.driver.plate}</dt>
            <dd className="font-medium">
              <bdi>{d.plateNumber}</bdi>
            </dd>
          </dl>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <a href={waLink(d.phone)} target="_blank" rel="noopener noreferrer" className="btn btn-primary flex-1 sm:flex-none">
            <WhatsAppIcon className="size-4" /> {t.driver.whatsapp}
          </a>
          <a href={`tel:${d.phone}`} className="btn btn-ghost flex-1 sm:flex-none">
            {t.driver.call}
          </a>
        </div>
      </div>
    </section>
  );
}
