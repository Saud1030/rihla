import "server-only";
import path from "node:path";
import PDFDocument from "pdfkit";
import bidiFactory from "bidi-js";
import type { Booking } from "@/db/schema";
import { formatDate, formatDateTime, formatSAR, formatTime } from "./format";
import { receiptNo } from "./documents";
import { maskPhone } from "./booking";

/**
 * The payment voucher as a PDF file, so it can be sent to the customer as a WhatsApp document.
 * pdfkit shapes Arabic letters (through fontkit); the bidi algorithm here puts Arabic and
 * numbers/Latin parts of a line in the right visual order.
 */

const FONTS = path.join(process.cwd(), "assets", "fonts");
const REGULAR = path.join(FONTS, "IBMPlexSansArabic_400Regular.ttf");
const BOLD = path.join(FONTS, "IBMPlexSansArabic_700Bold.ttf");
const bidi = bidiFactory();

type Company = { name: string; vatNumber: string; crNumber: string; address: string; phone: string; email: string };

const ARABIC = /[\u0600-\u06FF]/;
/** keep a phone number or code in one piece inside Arabic text */
export const isolate = (s: string) => (/[\u0600-\u065F\u066E-\u06FF]/.test(s) ? s : `\u2066${s}\u2069`);

/**
 * What to hand to pdfkit for one run. fontkit shapes and reverses any run it sees as Arabic script,
 * and pdfkit drops plain spaces inside a reversed run, so: spaces become no-break spaces, and a
 * left-to-right run made of Arabic digits is reversed first (fontkit reverses it back).
 */
function drawable(r: { text: string; rtl: boolean }) {
  let t = r.text.replace(/[\u2066-\u2069\u200E\u200F\u061C]/g, "");
  // brackets are mirrored in right-to-left text
  if (r.rtl) t = t.replace(/[()[\]{}]/g, (c) => ({ "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{" })[c]!);
  if (r.rtl || ARABIC.test(t)) t = t.replace(/ /g, "\u00A0");
  if (!r.rtl && ARABIC.test(t)) t = [...t].reverse().join("");
  return t;
}

/** split a line into same-direction runs, in the order they are drawn from left to right */
function visualRuns(text: string, base: "rtl" | "ltr" | "auto") {
  // an isolated part (phone, code) is one left-to-right piece: its neutral characters count as Latin
  const probe = text.replace(/\u2066([^\u2069]*)\u2069/g, (_m, inner: string) => `\u2066${"a".repeat(inner.length)}\u2069`);
  const { levels, paragraphs } = bidi.getEmbeddingLevels(probe, base === "auto" ? undefined : base);
  const baseRtl = (paragraphs[0]?.level ?? 0) % 2 === 1;
  const runs: { text: string; rtl: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const rtl = levels[i] % 2 === 1;
    const last = runs[runs.length - 1];
    if (last && last.rtl === rtl) last.text += text[i];
    else runs.push({ text: text[i], rtl });
  }
  return baseRtl ? runs.reverse() : runs;
}

const T = {
  ar: {
    title: "سند دفع",
    no: "رقم السند",
    date: "تاريخ الإصدار",
    booking: "رقم الحجز",
    from: "استلمنا من",
    amount: "المبلغ",
    for: "وذلك عن",
    trip: "موعد الرحلة",
    method: "طريقة الدفع",
    paidAt: "وقت الدفع",
    methods: { myfatoorah: "دفع إلكتروني - ماي فاتورة", bank_transfer: "تحويل بنكي" },
    vat: "الرقم الضريبي",
    cr: "السجل التجاري",
    note: "هذا السند يثبت استلام المبلغ وليس فاتورة ضريبية. تصلك الفاتورة الضريبية بعد انتهاء الرحلة.",
  },
  en: {
    title: "Payment voucher",
    no: "Voucher no.",
    date: "Issued",
    booking: "Booking",
    from: "Received from",
    amount: "Amount",
    for: "For",
    trip: "Trip date",
    method: "Payment method",
    paidAt: "Paid at",
    methods: { myfatoorah: "Online payment - MyFatoorah", bank_transfer: "Bank transfer" },
    vat: "VAT number",
    cr: "CR number",
    note: "This voucher confirms the payment and is not a tax invoice. Your tax invoice is sent when the trip ends.",
  },
};

export function receiptFileName(b: Pick<Booking, "receiptNo">) {
  return `${receiptNo(b.receiptNo)}.pdf`;
}

export async function receiptPdf(b: Booking, c: Company): Promise<Buffer> {
  const lang = b.locale === "en" ? "en" : "ar";
  const t = T[lang];
  const ar = lang === "ar";
  const doc = new PDFDocument({ size: "A5", margin: 36, info: { Title: `${t.title} ${receiptNo(b.receiptNo)}`, Author: c.name } });
  doc.registerFont("r", REGULAR);
  doc.registerFont("b", BOLD);
  const chunks: Buffer[] = [];
  doc.on("data", (d: Buffer) => chunks.push(d));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  const L = doc.page.margins.left;
  const R = doc.page.width - doc.page.margins.right;
  const W = R - L;
  const ink = "#1b2420";
  const muted = "#5f6b66";
  const green = "#0f6b4f";

  /** one line, aligned to the start side of the language (right for Arabic) or to the given edge */
  function line(text: string, o: { x: number; w: number; y: number; size: number; font?: "r" | "b"; color?: string; align?: "start" | "end" }) {
    doc.font(o.font ?? "r").fontSize(o.size).fillColor(o.color ?? ink);
    const runs = visualRuns(text, ar ? "rtl" : "ltr");
    const widths = runs.map((r) => doc.widthOfString(drawable(r)));
    const total = widths.reduce((a, b) => a + b, 0);
    const toRight = (o.align ?? "start") === "start" ? ar : !ar;
    let x = toRight ? o.x + o.w - total : o.x;
    runs.forEach((r, i) => {
      doc.text(drawable(r), x, o.y, { lineBreak: false });
      x += widths[i];
    });
  }

  /** wrap by words to fit the width; returns the lines */
  function wrap(text: string, size: number, w: number, font: "r" | "b" = "r") {
    doc.font(font).fontSize(size);
    const out: string[] = [];
    let cur = "";
    for (const word of text.split(/\s+/)) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && doc.widthOfString(next) > w) {
        out.push(cur);
        cur = word;
      } else cur = next;
    }
    if (cur) out.push(cur);
    return out;
  }

  let y = doc.page.margins.top;
  // company (start side) and title (end side)
  line(c.name, { x: L, w: W, y, size: 15, font: "b" });
  line(t.title, { x: L, w: W, y, size: 20, font: "b", color: green, align: "end" });
  y += 34;
  const companyLines = [c.vatNumber && `${t.vat}: ${c.vatNumber}`, c.crNumber && `${t.cr}: ${c.crNumber}`, c.address, [c.phone, c.email].filter(Boolean).map(isolate).join("  ")].filter(Boolean) as string[];
  const meta: [string, string][] = [
    [t.no, receiptNo(b.receiptNo)],
    [t.date, b.receiptAt ? formatDate(b.receiptAt, lang) : "-"],
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

  // body rows: label on the start side, value next to it
  const labelW = 95;
  const valueW = W - labelW - 10;
  const row = (label: string, value: string, o: { size?: number; font?: "r" | "b"; sub?: string } = {}) => {
    const size = o.size ?? 11;
    line(label, { x: ar ? R - labelW : L, w: labelW, y: y + (size > 11 ? (size - 11) / 2 : 0), size: 10, color: muted });
    const lines = wrap(value, size, valueW, o.font);
    for (const l of lines) {
      line(l, { x: ar ? L : L + labelW + 10, w: valueW, y, size, font: o.font });
      y += size + 7;
    }
    if (o.sub) {
      line(o.sub, { x: ar ? L : L + labelW + 10, w: valueW, y: y - 2, size: 9, color: muted });
      y += 14;
    }
    y += 8;
  };
  row(t.from, `${b.customerName}  ${isolate(maskPhone(b.customerPhone))}`, { font: "b" });
  row(t.amount, formatSAR(b.amount, lang), { size: 18, font: "b" });
  row(t.for, `${b.routeTitle} - ${b.vehicleName}`, { sub: `${t.trip}: ${formatDate(b.pickupDate, lang)} - ${formatTime(b.pickupTime, lang)}` });
  row(t.method, b.paymentMethod ? t.methods[b.paymentMethod] : "-");
  row(t.paidAt, b.paidAt ? formatDateTime(b.paidAt, lang) : "-");

  // note
  y += 6;
  const noteLines = wrap(t.note, 9.5, W - 24);
  const boxH = noteLines.length * 15 + 16;
  doc.roundedRect(L, y, W, boxH, 6).fill("#eef2f0");
  let yn = y + 9;
  for (const l of noteLines) {
    line(l, { x: L + 12, w: W - 24, y: yn, size: 9.5 });
    yn += 15;
  }

  doc.end();
  return done;
}
