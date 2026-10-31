import "server-only";
import nodemailer from "nodemailer";
import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Notification } from "@/db/schema";
import { site } from "@/config/site";
import { waNumber } from "./phone";

/**
 * Outgoing WhatsApp messages and emails.
 *
 * Every message is first saved in the `notifications` table, then sent:
 *  - WhatsApp through the WhatsApp Business Cloud API (Meta) when WHATSAPP_TOKEN and
 *    WHATSAPP_PHONE_NUMBER_ID are set. Messages to customers and drivers who haven't written to you in
 *    the last 24 hours must use an approved template: set its name in the panel (Messages page).
 *  - Email through SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM).
 * Without them the message stays "pending" and the panel shows a button that opens it in WhatsApp
 * (or the mail app) ready to send by hand. Nothing here ever throws into the booking flow.
 */

export type NotifyKind = "driver_trip" | "customer_driver" | "rating_request" | "rating_received" | "driver_approved" | "driver_rejected" | "driver_suspended" | "driver_blocked";

export const KIND_LABELS: Record<NotifyKind, string> = {
  driver_trip: "بيانات العميل للسائق",
  customer_driver: "بيانات السائق للعميل",
  rating_request: "طلب تقييم من العميل",
  rating_received: "تقييم جديد (بريد الشركة)",
  driver_approved: "قبول طلب سائق",
  driver_rejected: "رفض طلب سائق",
  driver_suspended: "إيقاف سائق مؤقتًا",
  driver_blocked: "حظر سائق",
};

/** Template parameters in order ({{1}}, {{2}} ...) and a suggested Arabic template text to create in Meta */
export const TEMPLATES: Record<Exclude<NotifyKind, "rating_received" | "driver_approved" | "driver_rejected" | "driver_suspended" | "driver_blocked">, { setting: string; params: string[]; suggested: string }> = {
  driver_trip: {
    setting: "wa_tpl_driver_trip",
    params: ["اسم السائق", "رقم الحجز", "اسم العميل", "جوال العميل", "الموعد", "مكان الاستلام", "الوجهة", "الركاب والحقائب", "ملاحظات"],
    suggested:
      "مرحبًا {{1}}، لديك رحلة جديدة رقم {{2}}.\nالعميل: {{3}}\nجوال العميل: {{4}}\nالموعد: {{5}}\nالاستلام: {{6}}\nالوجهة: {{7}}\nالركاب والحقائب: {{8}}\nملاحظات: {{9}}",
  },
  customer_driver: {
    setting: "wa_tpl_customer_driver",
    params: ["اسم العميل", "رقم الحجز", "اسم السائق", "جوال السائق", "السيارة", "رقم اللوحة", "رابط الحجز"],
    suggested:
      "مرحبًا {{1}}، تم تحديد السائق لرحلتك رقم {{2}}.\nالسائق: {{3}}\nجواله: {{4}}\nالسيارة: {{5}}\nاللوحة: {{6}}\nصورة السائق وتفاصيل الرحلة: {{7}}",
  },
  rating_request: {
    setting: "wa_tpl_rating_request",
    params: ["اسم العميل", "اسم السائق", "رابط التقييم"],
    suggested: "شكرًا {{1}} لاختيارك خدماتنا. نسعد بتقييمك للسائق {{2}} ولخدمتنا من هنا: {{3}}",
  },
};

/**
 * Settings read straight from the database: this file also runs outside page requests
 * (the background retry), where the request-time page cache isn't available.
 */
export async function readSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(s.settings);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
export const companyName = (st: Record<string, string>, lang: "ar" | "en") =>
  st[`company_name_${lang}`]?.trim() || site.name[lang];

const WA_BASE = () => (process.env.WHATSAPP_API_BASE || "https://graph.facebook.com/v21.0").replace(/\/$/, "");
export const whatsappConfigured = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
export const emailConfigured = () => process.env.EMAIL_TRANSPORT === "log" || !!(process.env.SMTP_HOST && process.env.SMTP_FROM);

type NewMessage = {
  bookingId?: string | null;
  channel: "whatsapp" | "email";
  kind: NotifyKind;
  recipient: string;
  recipientName?: string;
  subject?: string;
  body: string;
  params?: string[];
};

/** Template parameters may not contain line breaks, tabs or long runs of spaces */
const oneLine = (v: string) => (v || "-").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 900) || "-";

/** Save and send. Returns the saved row (status tells whether it went out). */
export async function notify(m: NewMessage): Promise<Notification | null> {
  try {
    const [row] = await db
      .insert(s.notifications)
      .values({
        bookingId: m.bookingId ?? null,
        channel: m.channel,
        kind: m.kind,
        recipient: m.recipient,
        recipientName: m.recipientName ?? "",
        subject: m.subject ?? "",
        body: m.body,
        params: (m.params ?? []).map(oneLine),
      })
      .returning();
    return await deliver(row);
  } catch (e) {
    console.error("notify failed", e);
    return null;
  }
}

/** Try to send a saved message (also used by "retry" in the panel and the background retry) */
export async function deliver(row: Notification): Promise<Notification> {
  if (row.status === "sent" || row.status === "manual") return row;
  const st = await readSettings();
  let result: { ok: true; id: string } | { ok: false; error: string } | null = null;
  if (row.channel === "whatsapp") {
    if (whatsappConfigured() && st.wa_auto !== "0") result = await sendWhatsApp(row, st);
  } else if (emailConfigured()) {
    result = await sendEmail(row);
  }
  if (!result) return row; // no provider: stays pending for sending by hand
  const [updated] = await db
    .update(s.notifications)
    .set(
      result.ok
        ? { status: "sent", providerId: result.id, error: null, sentAt: new Date(), attempts: row.attempts + 1 }
        : { status: "failed", error: result.error.slice(0, 500), attempts: row.attempts + 1 },
    )
    .where(eq(s.notifications.id, row.id))
    .returning();
  return updated;
}

async function sendWhatsApp(row: Notification, st: Record<string, string>) {
  const tpl = row.kind in TEMPLATES ? TEMPLATES[row.kind as keyof typeof TEMPLATES] : null;
  const templateName = tpl ? (st[tpl.setting] ?? "").trim() : "";
  const to = waNumber(row.recipient);
  const payload = templateName
    ? {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: st.wa_template_lang || "ar" },
          components: [{ type: "body", parameters: row.params.map((text) => ({ type: "text", text })) }],
        },
      }
    : // plain text only reaches people who wrote to your WhatsApp number in the last 24 hours
      { messaging_product: "whatsapp", to, type: "text", text: { preview_url: true, body: row.body } };
  try {
    const res = await fetch(`${WA_BASE()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => null)) as { messages?: { id: string }[]; error?: { message?: string; code?: number } } | null;
    if (res.ok && json?.messages?.[0]?.id) return { ok: true as const, id: json.messages[0].id };
    return { ok: false as const, error: `WhatsApp ${res.status}: ${json?.error?.message ?? "رفض غير معروف"}${json?.error?.code ? ` (${json.error.code})` : ""}` };
  } catch (e) {
    return { ok: false as const, error: `WhatsApp غير متاح: ${(e as Error).message}` };
  }
}

let transport: nodemailer.Transporter | null = null;
async function sendEmail(row: Notification) {
  try {
    transport ??=
      process.env.EMAIL_TRANSPORT === "log"
        ? nodemailer.createTransport({ jsonTransport: true })
        : nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: Number(process.env.SMTP_PORT) === 465,
            auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
          });
    const info = await transport.sendMail({
      from: process.env.SMTP_FROM || "no-reply@localhost",
      to: row.recipient,
      subject: row.subject,
      text: row.body,
    });
    return { ok: true as const, id: String(info.messageId ?? "sent") };
  } catch (e) {
    return { ok: false as const, error: `البريد: ${(e as Error).message}` };
  }
}

/** Background retry (messages from the last 24 hours): failed ones get up to 3 tries; pending ones go out once a provider is connected */
export async function retryDue() {
  const rows = await db
    .select()
    .from(s.notifications)
    .where(
      and(
        inArray(s.notifications.status, ["pending", "failed"]),
        lt(s.notifications.attempts, 3),
        gt(s.notifications.createdAt, new Date(Date.now() - 24 * 3600_000)),
      ),
    )
    .limit(20);
  for (const r of rows) {
    if (r.status === "pending" && r.channel === "whatsapp" && !whatsappConfigured()) continue;
    if (r.status === "pending" && r.channel === "email" && !emailConfigured()) continue;
    await deliver(r);
  }
}
