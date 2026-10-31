import QRCode from "qrcode";
import type { Booking } from "@/db/schema";
import type { Locale } from "@/i18n/dictionaries";
import { formatDate, formatDateTime, formatSAR, formatTime } from "@/lib/format";
import { maskPhone } from "@/lib/booking";
import { invoiceNo, receiptNo, zatcaQr } from "@/lib/documents";
import { PrintButton } from "./print-button";

type Company = { name: string; logoUrl: string | null; vatNumber: string; crNumber: string; address: string; phone: string; email: string };

const T = {
  ar: {
    receipt: "سند دفع",
    receiptNote: "هذا السند يثبت استلام المبلغ وليس فاتورة ضريبية. تصلك الفاتورة الضريبية بعد انتهاء الرحلة.",
    taxInvoice: "فاتورة ضريبية مبسطة",
    invoice: "فاتورة",
    no: "الرقم",
    date: "تاريخ الإصدار",
    booking: "رقم الحجز",
    receivedFrom: "استلمنا من",
    amount: "المبلغ",
    forWhat: "وذلك عن",
    method: "طريقة الدفع",
    paidAt: "وقت الدفع",
    methods: { myfatoorah: "دفع إلكتروني (ماي فاتورة)", bank_transfer: "تحويل بنكي" },
    customer: "العميل",
    vat: "الرقم الضريبي",
    cr: "السجل التجاري",
    desc: "الوصف",
    qty: "الكمية",
    unit: "السعر قبل الضريبة",
    vatRate: "نسبة الضريبة",
    vatAmount: "مبلغ الضريبة",
    total: "الإجمالي",
    subtotal: "المجموع قبل الضريبة",
    totalVat: "إجمالي الضريبة",
    grand: "الإجمالي شامل الضريبة",
    tripDate: "موعد الرحلة",
    voucher: "سند الدفع",
    print: "طباعة / حفظ PDF",
    status: { paid: "مدفوع", cancelled: "الحجز ملغي" },
    refunded: "تم إلغاء هذا الحجز",
  },
  en: {
    receipt: "Payment voucher",
    receiptNote: "This voucher confirms the payment and is not a tax invoice. Your tax invoice is sent when the trip ends.",
    taxInvoice: "Simplified tax invoice",
    invoice: "Invoice",
    no: "No.",
    date: "Issued",
    booking: "Booking",
    receivedFrom: "Received from",
    amount: "Amount",
    forWhat: "For",
    method: "Payment method",
    paidAt: "Paid at",
    methods: { myfatoorah: "Online payment (MyFatoorah)", bank_transfer: "Bank transfer" },
    customer: "Customer",
    vat: "VAT number",
    cr: "CR number",
    desc: "Description",
    qty: "Qty",
    unit: "Price before VAT",
    vatRate: "VAT rate",
    vatAmount: "VAT",
    total: "Total",
    subtotal: "Total before VAT",
    totalVat: "Total VAT",
    grand: "Total including VAT",
    tripDate: "Trip date",
    voucher: "Payment voucher",
    print: "Print / save as PDF",
    status: { paid: "Paid", cancelled: "Booking cancelled" },
    refunded: "This booking was cancelled",
  },
};

function Head({ c, title, rows, lang }: { c: Company; title: string; rows: [string, React.ReactNode][]; lang: Locale }) {
  const t = T[lang];
  return (
    <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-5">
      <div className="space-y-1 text-sm">
        {c.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- the company's own logo
          <img src={c.logoUrl} alt={c.name} className="h-12 w-auto mb-2" />
        ) : null}
        <p className="font-semibold text-lg">{c.name}</p>
        {c.vatNumber && (
          <p>
            {t.vat}: <span className="tabular">{c.vatNumber}</span>
          </p>
        )}
        {c.crNumber && (
          <p>
            {t.cr}: <span className="tabular">{c.crNumber}</span>
          </p>
        )}
        {c.address && <p className="text-muted">{c.address}</p>}
        {(c.phone || c.email) && (
          <p className="text-muted" dir="ltr" style={{ textAlign: lang === "ar" ? "right" : "left" }}>
            {[c.phone, c.email].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      <div className="text-end space-y-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <dl className="text-sm grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 justify-end">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="tabular font-medium" dir="ltr">
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </header>
  );
}

const sheet = "mx-auto max-w-3xl bg-paper border border-line rounded-xl p-6 sm:p-8 space-y-6 print:border-0 print:rounded-none print:p-0 print:max-w-none";

/** سند دفع: what was received, from whom, for which booking */
export function ReceiptSheet({ b, c, lang }: { b: Booking; c: Company; lang: Locale }) {
  const t = T[lang];
  const rows: [string, React.ReactNode][] = [
    [t.no, receiptNo(b.receiptNo)],
    [t.date, b.receiptAt ? formatDate(b.receiptAt, lang) : "—"],
    [t.booking, b.ref],
  ];
  return (
    <article className={sheet} data-testid="receipt">
      <Head c={c} title={t.receipt} rows={rows} lang={lang} />
      {b.status === "cancelled" && <p className="rounded-lg bg-danger-soft text-danger px-4 py-2 text-sm">{t.refunded}</p>}
      <dl className="grid sm:grid-cols-[12rem_1fr] gap-x-4 gap-y-3 text-[15px]">
        <dt className="text-muted">{t.receivedFrom}</dt>
        <dd className="font-medium">
          {b.customerName} · <bdo dir="ltr">{maskPhone(b.customerPhone)}</bdo>
        </dd>
        <dt className="text-muted">{t.amount}</dt>
        <dd className="text-2xl font-semibold tabular" data-testid="receipt-amount">
          {formatSAR(b.amount, lang)}
        </dd>
        <dt className="text-muted">{t.forWhat}</dt>
        <dd>
          {b.routeTitle} · {b.vehicleName}
          <span className="block text-sm text-muted">
            {t.tripDate}: {formatDate(b.pickupDate, lang)} · {formatTime(b.pickupTime, lang)}
          </span>
        </dd>
        <dt className="text-muted">{t.method}</dt>
        <dd>{b.paymentMethod ? t.methods[b.paymentMethod] : "—"}</dd>
        <dt className="text-muted">{t.paidAt}</dt>
        <dd className="tabular">{b.paidAt ? formatDateTime(b.paidAt, lang) : "—"}</dd>
      </dl>
      <p className="rounded-lg bg-stone px-4 py-3 text-sm">{t.receiptNote}</p>
      <div className="flex justify-end">
        <PrintButton label={t.print} />
      </div>
    </article>
  );
}

/** فاتورة ضريبية مبسطة (B2C) with the ZATCA QR code when the company has a VAT number */
export async function InvoiceSheet({ b, c, lang }: { b: Booking; c: Company; lang: Locale }) {
  const t = T[lang];
  const taxed = !!c.vatNumber;
  const issued = b.invoiceAt ?? new Date();
  const qr = taxed ? await QRCode.toString(zatcaQr({ seller: c.name, vatNumber: c.vatNumber, time: issued, total: b.amount, vat: b.vatAmount }), { type: "svg", margin: 0, errorCorrectionLevel: "M" }) : null;
  const pct = (b.vatRate / 10000).toLocaleString(lang === "ar" ? "ar-SA" : "en-US", { style: "percent", maximumFractionDigits: 2 });
  const rows: [string, React.ReactNode][] = [
    [t.no, invoiceNo(b.invoiceNo)],
    [t.date, formatDateTime(issued, lang)],
    [t.booking, b.ref],
  ];
  return (
    <article className={sheet} data-testid="invoice">
      <Head c={c} title={taxed ? t.taxInvoice : t.invoice} rows={rows} lang={lang} />
      <p className="text-[15px]">
        <span className="text-muted">{t.customer}: </span>
        {b.customerName} · <bdo dir="ltr">{maskPhone(b.customerPhone)}</bdo>
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-line">
          <thead className="bg-stone">
            <tr>
              {[t.desc, t.qty, t.unit, t.vatRate, t.vatAmount, t.total].map((h) => (
                <th key={h} className="text-start font-medium px-3 py-2 border-b border-line">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-3 py-2 align-top">
                {b.routeTitle} · {b.vehicleName}
                <span className="block text-xs text-muted">
                  {t.tripDate}: {formatDate(b.pickupDate, lang)} · {formatTime(b.pickupTime, lang)}
                </span>
              </td>
              <td className="px-3 py-2 align-top tabular">{(1).toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}</td>
              <td className="px-3 py-2 align-top tabular whitespace-nowrap">{formatSAR(b.subtotal, lang)}</td>
              <td className="px-3 py-2 align-top tabular">{pct}</td>
              <td className="px-3 py-2 align-top tabular whitespace-nowrap">{formatSAR(b.vatAmount, lang)}</td>
              <td className="px-3 py-2 align-top tabular whitespace-nowrap">{formatSAR(b.amount, lang)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-6">
        {qr ? <div className="size-36 shrink-0 [&_svg]:w-full [&_svg]:h-full" data-testid="zatca-qr" aria-label="ZATCA QR" dangerouslySetInnerHTML={{ __html: qr }} /> : <span />}
        <dl className="text-sm grid grid-cols-[auto_auto] gap-x-6 gap-y-1 min-w-64">
          <dt className="text-muted">{t.subtotal}</dt>
          <dd className="tabular text-end">{formatSAR(b.subtotal, lang)}</dd>
          <dt className="text-muted">
            {t.totalVat} ({pct})
          </dt>
          <dd className="tabular text-end">{formatSAR(b.vatAmount, lang)}</dd>
          <dt className="font-semibold border-t border-line pt-1">{t.grand}</dt>
          <dd className="tabular text-end font-semibold border-t border-line pt-1" data-testid="invoice-total">
            {formatSAR(b.amount, lang)}
          </dd>
        </dl>
      </div>
      <p className="text-sm text-muted">
        {t.method}: {b.paymentMethod ? t.methods[b.paymentMethod] : "—"}
        {b.receiptNo ? ` · ${t.voucher} ${receiptNo(b.receiptNo)}` : ""}
      </p>
      <div className="flex justify-end">
        <PrintButton label={t.print} />
      </div>
    </article>
  );
}

export type { Company };
