import "server-only";
import PDFDocument from "pdfkit";
import { isolate, pdfWriter, registerFonts } from "./pdf-text";
import type { Booking } from "@/db/schema";
import { formatDate, formatDateTime, formatSAR, formatTime } from "./format";
import { invoiceNo } from "./documents";
import { maskPhone } from "./booking";

/**
 * The proforma invoice (فاتورة مبدئية) as a PDF: sent on WhatsApp when a booking is paid online,
 * and downloadable from the booking page. Same layout as the payment voucher PDF.
 */

type Company = { name: string; vatNumber: string; crNumber: string; address: string; phone: string; email: string };

const T = {
  ar: {
    title: "فاتورة مبدئية",
    no: "رقم الفاتورة",
    date: "تاريخ الإصدار",
    booking: "رقم الحجز",
    customer: "العميل",
    service: "الخدمة",
    trip: "موعد الرحلة",
    subtotal: "المبلغ قبل الضريبة",
    vatAmount: "ضريبة القيمة المضافة",
    total: "الإجمالي شامل الضريبة",
    method: "طريقة الدفع",
    paidAt: "وقت الدفع",
    methods: { myfatoorah: "دفع إلكتروني", bank_transfer: "تحويل بنكي", cash: "نقدًا (كاش)" },
    vat: "الرقم الضريبي",
    cr: "السجل التجاري",
  },
  en: {
    title: "Proforma invoice",
    no: "Invoice no.",
    date: "Issued",
    booking: "Booking",
    customer: "Customer",
    service: "Service",
    trip: "Trip date",
    subtotal: "Amount before VAT",
    vatAmount: "VAT",
    total: "Total incl. VAT",
    method: "Payment method",
    paidAt: "Paid at",
    methods: { myfatoorah: "Online payment", bank_transfer: "Bank transfer", cash: "Cash" },
    vat: "VAT number",
    cr: "CR number",
  },
};

export function invoiceFileName(b: Pick<Booking, "invoiceNo">) {
  return `${invoiceNo(b.invoiceNo)}.pdf`;
}

export async function invoicePdf(b: Booking, c: Company): Promise<Buffer> {
  const lang = b.locale === "en" ? "en" : "ar";
  const t = T[lang];
  const ar = lang === "ar";
  const doc = new PDFDocument({ size: "A5", margin: 36, info: { Title: `${t.title} ${invoiceNo(b.invoiceNo)}`, Author: c.name } });
  registerFonts(doc);
  const chunks: Buffer[] = [];
  doc.on("data", (d: Buffer) => chunks.push(d));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  const L = doc.page.margins.left;
  const R = doc.page.width - doc.page.margins.right;
  const W = R - L;
  const muted = "#5f6b66";
  const green = "#0f6b4f";
  const { line, wrap } = pdfWriter(doc, ar, "#1b2420");

  let y = doc.page.margins.top;
  line(c.name, { x: L, w: W, y, size: 15, font: "b" });
  line(t.title, { x: L, w: W, y, size: 20, font: "b", color: green, align: "end" });
  y += 34;
  const companyLines = [c.vatNumber && `${t.vat}: ${c.vatNumber}`, c.crNumber && `${t.cr}: ${c.crNumber}`, c.address, [c.phone, c.email].filter(Boolean).map(isolate).join("  ")].filter(Boolean) as string[];
  const meta: [string, string][] = [
    [t.no, invoiceNo(b.invoiceNo)],
    [t.date, b.invoiceAt ? formatDate(b.invoiceAt, lang) : "-"],
    [t.booking, b.ref],
  ];
  const half = W / 2;
  let yl = y;
  for (const l of companyLines) {
    line(l, { x: ar ? L + half : L, w: half, y: yl, size: 9, color: muted });
    yl += 14;
  }
  let ym = y;
  for (const [k, v] of meta) {
    line(`${k}: ${isolate(v)}`, { x: ar ? L : L + half, w: half, y: ym, size: 9.5, align: "end" });
    ym += 15;
  }
  y = Math.max(yl, ym) + 10;
  doc.moveTo(L, y).lineTo(R, y).lineWidth(0.7).strokeColor("#d9dfdc").stroke();
  y += 16;

  const labelW = 110;
  const valueW = W - labelW - 10;
  const row = (label: string, value: string, o: { size?: number; font?: "r" | "b"; sub?: string } = {}) => {
    const size = o.size ?? 11;
    line(label, { x: ar ? R - labelW : L, w: labelW, y: y + (size > 11 ? (size - 11) / 2 : 0), size: 10, color: muted });
    for (const l of wrap(value, size, valueW, o.font)) {
      line(l, { x: ar ? L : L + labelW + 10, w: valueW, y, size, font: o.font });
      y += size + 7;
    }
    if (o.sub) {
      line(o.sub, { x: ar ? L : L + labelW + 10, w: valueW, y: y - 2, size: 9, color: muted });
      y += 14;
    }
    y += 8;
  };
  const pct = (b.vatRate / 10000).toLocaleString(ar ? "ar-SA" : "en-US", { style: "percent", maximumFractionDigits: 2 });
  row(t.customer, `${b.customerName}  ${isolate(maskPhone(b.customerPhone))}`, { font: "b" });
  row(t.service, `${b.routeTitle} - ${b.vehicleName}`, { sub: `${t.trip}: ${formatDate(b.pickupDate, lang)} - ${formatTime(b.pickupTime, lang)}` });
  row(t.subtotal, formatSAR(b.subtotal, lang));
  row(`${t.vatAmount} (${pct})`, formatSAR(b.vatAmount, lang));
  doc.moveTo(L, y - 4).lineTo(R, y - 4).lineWidth(0.7).strokeColor("#d9dfdc").stroke();
  y += 4;
  row(t.total, formatSAR(b.amount, lang), { size: 16, font: "b" });
  row(t.method, b.paymentMethod ? t.methods[b.paymentMethod] : "-");
  if (b.paidAt) row(t.paidAt, formatDateTime(b.paidAt, lang));

  doc.end();
  return done;
}
