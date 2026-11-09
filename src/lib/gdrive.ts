import "server-only";
import type ExcelJS from "exceljs";
import { db, schema as s } from "@/db";
import { listBookings, parseBookingFilters } from "./admin-data";
import { bookingsXlsx } from "./bookings-export";
import { getBrand } from "./brand";
import { todayInRiyadh } from "./booking";
import { invalidateCatalogCache, getSettings } from "./catalog";
import { formatDate, formatDateTime } from "./format";
import { logoForFiles } from "./logo-image";
import { getDictionary } from "@/i18n/dictionaries";

/**
 * Google Drive (Admin -> Integrations): the admin connects his Google account once, and booking and
 * revenue reports (Excel) are uploaded to a folder the site creates, on a schedule or on demand.
 * Scope drive.file: the site only sees the files it made, nothing else in the Drive.
 */

const AUTH_URL = process.env.GDRIVE_AUTH_URL ?? "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = process.env.GDRIVE_TOKEN_URL ?? "https://oauth2.googleapis.com/token";
const REVOKE_URL = process.env.GDRIVE_REVOKE_URL ?? "https://oauth2.googleapis.com/revoke";
const API = process.env.GDRIVE_API ?? "https://www.googleapis.com";
export const GDRIVE_SCOPES = "openid email https://www.googleapis.com/auth/drive.file";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type Schedule = "off" | "daily" | "weekly" | "monthly";
export const SCHEDULES: [Schedule, string][] = [
  ["off", "يدوي فقط"],
  ["daily", "يومي: تقرير أمس، كل صباح"],
  ["weekly", "أسبوعي: آخر ٧ أيام، كل أحد"],
  ["monthly", "شهري: الشهر الماضي، أول كل شهر"],
];

export type GdriveConfig = { clientId: string; clientSecret: string };
export const gdriveApp = (st: Record<string, string | undefined>): GdriveConfig | null => {
  const clientId = st.gd_client_id?.trim(), clientSecret = st.gd_client_secret?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
};
export const gdriveConnected = (st: Record<string, string | undefined>) => !!(gdriveApp(st) && st.gd_refresh_token);

/** the address Google sends the admin back to; it must be added as-is in Google Cloud */
export const redirectUri = (base: string) => `${base.replace(/\/$/, "")}/api/admin/gdrive/callback`;

export function authUrl(cfg: GdriveConfig, base: string, state: string) {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri(base),
    response_type: "code",
    scope: GDRIVE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${q}`;
}

async function save(values: Record<string, string>) {
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(values))
      await tx.insert(s.settings).values({ key, value }).onConflictDoUpdate({ target: s.settings.key, set: { value } });
  });
  invalidateCatalogCache();
}

async function googleJson(res: Response) {
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text);
  } catch {}
  if (!res.ok) {
    const err = body.error as { message?: string } | string | undefined;
    const msg = typeof err === "string" ? `${err}${body.error_description ? `: ${body.error_description}` : ""}` : err?.message;
    throw new Error(msg || `Google ${res.status}`);
  }
  return body;
}

/** after the admin approved: keep the refresh token and the account's email, and make the folder */
export async function finishConnect(cfg: GdriveConfig, base: string, code: string) {
  const tok = await googleJson(
    await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: redirectUri(base), grant_type: "authorization_code" }),
      signal: AbortSignal.timeout(15000),
    }),
  );
  const refresh = String(tok.refresh_token ?? "");
  if (!refresh) throw new Error("لم يرجع قوقل مفتاح الوصول الدائم. احذف وصول الموقع من حساب قوقل (Security ← Third-party access) ثم اربط مرة ثانية.");
  let email = "";
  if (typeof tok.id_token === "string") {
    try {
      email = String(JSON.parse(Buffer.from(tok.id_token.split(".")[1], "base64url").toString()).email ?? "");
    } catch {}
  }
  await save({ gd_refresh_token: refresh, gd_email: email, gd_folder_id: "", gd_last_error: "" });
  await ensureFolder(String(tok.access_token));
}

async function accessToken(st: Record<string, string | undefined>) {
  const cfg = gdriveApp(st);
  if (!cfg || !st.gd_refresh_token) throw new Error("قوقل درايف غير مربوط.");
  const tok = await googleJson(
    await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ refresh_token: st.gd_refresh_token, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token" }),
      signal: AbortSignal.timeout(15000),
    }),
  ).catch((e: Error) => {
    if (/invalid_grant/.test(e.message)) throw new Error("انتهى ربط قوقل درايف أو أُلغي من حساب قوقل. اربطه مرة ثانية.");
    throw e;
  });
  return String(tok.access_token);
}

/** the reports folder: reused while it exists (and isn't in the bin), otherwise made again */
async function ensureFolder(token: string) {
  const st = await getSettings();
  const auth = { Authorization: `Bearer ${token}` };
  if (st.gd_folder_id) {
    const r = await fetch(`${API}/drive/v3/files/${encodeURIComponent(st.gd_folder_id)}?fields=id,trashed`, { headers: auth, signal: AbortSignal.timeout(15000) });
    if (r.ok && !(await r.json()).trashed) return st.gd_folder_id;
  }
  const brand = await getBrand();
  const folder = await googleJson(
    await fetch(`${API}/drive/v3/files?fields=id`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${brand.name.ar} — تقارير الحجوزات والإيرادات`, mimeType: "application/vnd.google-apps.folder" }),
      signal: AbortSignal.timeout(15000),
    }),
  );
  await save({ gd_folder_id: String(folder.id) });
  return String(folder.id);
}

export async function disconnect() {
  const st = await getSettings();
  if (st.gd_refresh_token) {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(st.gd_refresh_token)}`, { method: "POST", signal: AbortSignal.timeout(10000) }).catch(() => {});
  }
  await save({ gd_refresh_token: "", gd_email: "", gd_folder_id: "", gd_last_error: "" });
}

/* ---------- the report ---------- */

const PAID = new Set(["paid", "confirmed", "completed"]);

function revenueSheet(wb: ExcelJS.Workbook, rows: Awaited<ReturnType<typeof listBookings>>["rows"], title: string) {
  const ws = wb.addWorksheet("الإيرادات", { views: [{ rightToLeft: true }] });
  ws.columns = [{ width: 24 }, { width: 12 }, { width: 16 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 16 }];
  ws.getCell(1, 1).value = title;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.mergeCells(1, 1, 1, 7);
  ws.getCell(2, 1).value = "للحجوزات المدفوعة (مدفوع، مؤكد، مكتمل) حسب تاريخ الرحلة";
  ws.getCell(2, 1).font = { size: 10, color: { argb: "FF5F6B66" } };
  ws.mergeCells(2, 1, 2, 7);

  const paid = rows.filter((b) => PAID.has(b.status));
  const sum = (f: (b: (typeof rows)[number]) => number | null | undefined, list = paid) => list.reduce((a, b) => a + (f(b) ?? 0), 0) / 100;
  const net = sum((b) => b.subtotal), vat = sum((b) => b.vatAmount), gross = sum((b) => b.amount), fares = sum((b) => b.driverFare);
  const money = '#,##0.00 "⃁"';
  const summary: [string, number, boolean][] = [
    ["عدد الحجوزات المدفوعة", paid.length, false],
    ["الإيراد قبل الضريبة", net, true],
    ["الضريبة", vat, true],
    ["الإيراد بعد الضريبة", gross, true],
    ["أجور السائقين", fares, true],
    ["الصافي بعد أجور السائقين (قبل الضريبة)", net - fares, true],
  ];
  let r = 4;
  for (const [label, value, isMoney] of summary) {
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).font = { bold: true };
    ws.getCell(r, 2).value = value;
    if (isMoney) ws.getCell(r, 2).numFmt = money;
    ws.mergeCells(r, 2, r, 3);
    r++;
  }

  // day by day
  r += 1;
  const head = ws.getRow(r);
  head.values = ["التاريخ", "الحجوزات", "قبل الضريبة", "الضريبة", "بعد الضريبة", "أجور السائقين", "الصافي"];
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F6B4F" } }));
  const days = new Map<string, typeof paid>();
  for (const b of paid) days.set(b.pickupDate, [...(days.get(b.pickupDate) ?? []), b]);
  for (const [day, list] of [...days.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const n = sum((b) => b.subtotal, list), f = sum((b) => b.driverFare, list);
    const row = ws.addRow([day, list.length, n, sum((b) => b.vatAmount, list), sum((b) => b.amount, list), f, n - f]);
    for (let c = 3; c <= 7; c++) row.getCell(c).numFmt = money;
  }

  // bookings by status (all of them, paid or not)
  r = ws.rowCount + 2;
  ws.getCell(r, 1).value = "الحجوزات حسب الحالة";
  ws.getCell(r, 1).font = { bold: true };
  const statuses = new Map<string, number>();
  for (const b of rows) statuses.set(b.status, (statuses.get(b.status) ?? 0) + 1);
  const names = getDictionary("ar").booking.status as Record<string, string>;
  for (const [st, n] of statuses) ws.addRow([names[st] ?? st, n]);
}

/** the period a scheduled report covers, ending yesterday (Riyadh) */
export function periodFor(schedule: Exclude<Schedule, "off">, today = todayInRiyadh()) {
  const d = (iso: string, days: number) => {
    const x = new Date(`${iso}T12:00:00Z`);
    x.setUTCDate(x.getUTCDate() + days);
    return x.toISOString().slice(0, 10);
  };
  const yesterday = d(today, -1);
  if (schedule === "daily") return { from: yesterday, to: yesterday };
  if (schedule === "weekly") return { from: d(today, -7), to: yesterday };
  const first = `${today.slice(0, 8)}01`;
  const lastMonthEnd = d(first, -1);
  return { from: `${lastMonthEnd.slice(0, 8)}01`, to: lastMonthEnd };
}

/** build the Excel file for a period and upload it; returns the file's name and link */
export async function uploadReport(from: string, to: string) {
  const st = await getSettings();
  try {
    const token = await accessToken(st);
    const folder = await ensureFolder(token);
    const { rows } = await listBookings(parseBookingFilters({ from, to }), { all: true });
    const [brand, logo] = await Promise.all([getBrand(), logoForFiles()]);
    const range = from === to ? formatDate(from, "ar", { weekday: false }) : `${formatDate(from, "ar", { weekday: false })} — ${formatDate(to, "ar", { weekday: false })}`;
    const title = `تقرير الحجوزات والإيرادات: ${range}`;
    const file = await bookingsXlsx(rows, `${title} — ${rows.length.toLocaleString("ar-SA")} حجز`, { company: brand.name.ar, logo, at: new Date() }, (wb) => revenueSheet(wb, rows, title));
    const name = from === to ? `تقرير ${from}.xlsx` : `تقرير ${from} إلى ${to}.xlsx`;

    // multipart upload: the file's details, then its bytes
    const boundary = `rihla${Date.now().toString(36)}`;
    const meta = JSON.stringify({ name, parents: [folder], mimeType: XLSX });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${XLSX}\r\n\r\n`),
      file,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const up = await googleJson(
      await fetch(`${API}/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
        body: new Uint8Array(body),
        signal: AbortSignal.timeout(60000),
      }),
    );
    await save({ gd_last_run: new Date().toISOString(), gd_last_file: name, gd_last_link: String(up.webViewLink ?? ""), gd_last_error: "" });
    return { name, link: String(up.webViewLink ?? ""), count: rows.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await save({ gd_last_error: `${formatDateTime(new Date(), "ar")}: ${msg}`.slice(0, 500) });
    throw e;
  }
}

/** called by the background sweep: the scheduled report, once per period, after 6 am Riyadh time */
export async function gdriveDue() {
  const st = await getSettings();
  const schedule = (st.gd_schedule ?? "off") as Schedule;
  if (schedule === "off" || !gdriveConnected(st)) return;
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", hour12: false }).format(now));
  if (hour < 6) return;
  const today = todayInRiyadh();
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  if (schedule === "weekly" && weekday !== 0) return;
  if (schedule === "monthly" && !today.endsWith("-01")) return;
  const key = `${schedule}:${today}`;
  if (st.gd_last_key === key) return;
  // after a failure, try again at most once an hour
  if (st.gd_last_attempt && now.getTime() - Number(st.gd_last_attempt) < 60 * 60_000) return;
  await save({ gd_last_attempt: String(now.getTime()) });
  const { from, to } = periodFor(schedule, today);
  await uploadReport(from, to);
  await save({ gd_last_key: key, gd_last_attempt: "" });
}
