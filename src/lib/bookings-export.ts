import "server-only";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { getDictionary } from "@/i18n/dictionaries";
import type { TableBooking } from "./admin-data";
import type { Booking } from "@/db/schema";
import { bookingNo, formatDate, formatSAR, formatTime } from "./format";
import { isolate, pdfWriter, registerFonts } from "./pdf-text";

/** The bookings list (as filtered on the page) as an Excel sheet or a PDF table */

type Row = Booking & TableBooking;
const t = getDictionary("ar");
const sar = (h: number | null | undefined) => (h == null ? null : h / 100);
const to = (b: Row) => b.toName ?? (b.hours ? `بالساعة · ${b.hours} ساعة` : "");

const COLUMNS: { head: string; width: number; value: (b: Row) => string | number | null; money?: boolean }[] = [
  { head: "رقم الحجز", width: 11, value: (b) => bookingNo(b.number) },
  { head: "رمز العميل", width: 11, value: (b) => b.ref },
  { head: "التاريخ", width: 12, value: (b) => b.pickupDate },
  { head: "الوقت", width: 8, value: (b) => b.pickupTime },
  { head: "من", width: 28, value: (b) => b.fromName ?? "" },
  { head: "إلى", width: 28, value: (b) => to(b) },
  { head: "السيارة", width: 16, value: (b) => b.vehicleName },
  { head: "العميل", width: 20, value: (b) => b.customerName },
  { head: "جوال العميل", width: 16, value: (b) => b.customerPhone },
  { head: "السائق", width: 18, value: (b) => b.driverName ?? "" },
  { head: "جوال السائق", width: 16, value: (b) => b.driverPhone ?? "" },
  { head: "قبل الضريبة", width: 13, value: (b) => sar(b.subtotal), money: true },
  { head: "الضريبة", width: 11, value: (b) => sar(b.vatAmount), money: true },
  { head: "بعد الضريبة", width: 13, value: (b) => sar(b.amount), money: true },
  { head: "أجرة السائق", width: 13, value: (b) => sar(b.driverFare), money: true },
  { head: "الحالة", width: 14, value: (b) => t.booking.status[b.status] },
];

export async function bookingsXlsx(rows: Row[], title: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rihla";
  wb.created = new Date();
  const ws = wb.addWorksheet("الحجوزات", { views: [{ rightToLeft: true, state: "frozen", ySplit: 2 }] });
  ws.columns = COLUMNS.map((c) => ({ key: c.head, width: c.width }));
  ws.mergeCells(1, 1, 1, COLUMNS.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 13 };
  const head = ws.getRow(2);
  head.values = COLUMNS.map((c) => c.head);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F6B4F" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  for (const b of rows) ws.addRow(COLUMNS.map((c) => c.value(b)));
  COLUMNS.forEach((c, i) => {
    if (c.money) ws.getColumn(i + 1).numFmt = "#,##0.00";
  });
  // totals of the money columns
  if (rows.length) {
    const total = ws.addRow(COLUMNS.map((c, i) => (i === 0 ? "الإجمالي" : c.money ? { formula: `SUM(${ws.getColumn(i + 1).letter}3:${ws.getColumn(i + 1).letter}${rows.length + 2})` } : null)));
    total.font = { bold: true };
  }
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: COLUMNS.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function bookingsPdf(rows: Row[], title: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 24, info: { Title: title } });
  registerFonts(doc);
  const chunks: Buffer[] = [];
  doc.on("data", (d: Buffer) => chunks.push(d));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  const { line, wrap } = pdfWriter(doc, true);

  // columns for the printed table (fewer than the sheet, so they fit on the page)
  const cols: { head: string; w: number; value: (b: Row) => string }[] = [
    { head: "رقم الحجز", w: 46, value: (b) => bookingNo(b.number) },
    { head: "التاريخ والوقت", w: 70, value: (b) => `${formatDate(b.pickupDate, "ar", { weekday: false })} ${formatTime(b.pickupTime, "ar")}` },
    { head: "من", w: 92, value: (b) => b.fromName ?? "" },
    { head: "إلى", w: 92, value: (b) => to(b) },
    { head: "السيارة", w: 60, value: (b) => b.vehicleName },
    { head: "العميل", w: 70, value: (b) => b.customerName },
    { head: "جوال العميل", w: 68, value: (b) => b.customerPhone },
    { head: "السائق", w: 62, value: (b) => b.driverName ?? "—" },
    { head: "قبل الضريبة", w: 52, value: (b) => formatSAR(b.subtotal, "ar") },
    { head: "بعد الضريبة", w: 52, value: (b) => formatSAR(b.amount, "ar") },
    { head: "أجرة السائق", w: 52, value: (b) => (b.driverFare != null ? formatSAR(b.driverFare, "ar") : "—") },
    { head: "الحالة", w: 48, value: (b) => t.booking.status[b.status] },
  ];
  const L = doc.page.margins.left;
  const R = doc.page.width - doc.page.margins.right;
  const bottom = doc.page.height - doc.page.margins.bottom;
  const scale = (R - L) / cols.reduce((a, c) => a + c.w, 0);
  cols.forEach((c) => (c.w *= scale));
  const size = 7;

  let y = doc.page.margins.top;
  // dates stay in one left-to-right piece inside the Arabic title
  const shown = title.replace(/\d{4}-\d{2}-\d{2}/g, (m) => isolate(m));
  const header = () => {
    line(shown, { x: L, w: R - L, y, size: 12, font: "b" });
    y += 20;
    doc.rect(L, y, R - L, 16).fill("#0f6b4f");
    let x = R;
    for (const c of cols) {
      x -= c.w;
      line(c.head, { x: x + 3, w: c.w - 6, y: y + 3.5, size, font: "b", color: "#ffffff" });
    }
    y += 18;
  };
  header();
  rows.forEach((b, i) => {
    const cells = cols.map((c) => wrap(c.value(b), size, c.w - 6));
    const h = Math.max(...cells.map((l) => l.length)) * (size + 3) + 6;
    if (y + h > bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      header();
    }
    if (i % 2) doc.rect(L, y - 2, R - L, h).fill("#f1f4f2");
    let x = R;
    cols.forEach((c, k) => {
      x -= c.w;
      cells[k].forEach((l, j) => line(l, { x: x + 3, w: c.w - 6, y: y + j * (size + 3), size }));
    });
    y += h;
  });
  // totals
  if (rows.length) {
    if (y + 20 > bottom) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    const sum = (f: (b: Row) => number) => rows.reduce((a, b) => a + f(b), 0);
    y += 6;
    line(
      `عدد الحجوزات: ${rows.length.toLocaleString("ar-SA")}   ·   قبل الضريبة: ${formatSAR(sum((b) => b.subtotal), "ar")}   ·   بعد الضريبة: ${formatSAR(sum((b) => b.amount), "ar")}   ·   أجور السائقين: ${formatSAR(sum((b) => b.driverFare ?? 0), "ar")}`,
      { x: L, w: R - L, y, size: 9, font: "b" },
    );
  }
  doc.end();
  return done;
}
