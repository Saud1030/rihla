import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Booking } from "@/db/schema";
import { invoiceNo } from "./documents";
import { readSettings } from "./notify";

/**
 * Tax invoices through an e-invoicing platform (Admin -> Settings -> E-invoicing). Today: Wafeq (wafeq.com),
 * a Saudi accounting platform that issues ZATCA e-invoices. When a trip ends and our own invoice number is given,
 * the same invoice is created there (customer, line, VAT), and optionally reported to ZATCA.
 * API: https://developer.wafeq.com — Authorization: Api-Key <key>.
 */

export const WAFEQ_BASE = (process.env.WAFEQ_API_BASE || "https://api.wafeq.com/v1").replace(/\/$/, "");

export type EinvoiceConfig = { provider: "wafeq"; apiKey: string; account: string; taxRate: string; report: boolean } | null;

export function einvoiceConfig(st: Record<string, string>): EinvoiceConfig {
  if (st.einv_provider !== "wafeq" || !st.wafeq_api_key || !st.wafeq_account) return null;
  return { provider: "wafeq", apiKey: st.wafeq_api_key, account: st.wafeq_account, taxRate: st.wafeq_tax_rate ?? "", report: st.einv_report === "1" };
}

/** "abcd…wxyz" for the settings page */
export const maskKey = (k: string) => (k.length > 10 ? `${k.slice(0, 4)}…${k.slice(-4)}` : k ? "••••" : "");

class EinvoiceError extends Error {}

async function wafeq<T>(key: string, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${WAFEQ_BASE}${path}`, {
      method,
      headers: { Authorization: `Api-Key ${key}`, "Content-Type": "application/json", Accept: "application/json", ...(method === "POST" ? { "X-Wafeq-Idempotency-Key": randomUUID() } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new EinvoiceError("تعذّر الوصول إلى وافق");
  }
  const json = (await res.json().catch(() => null)) as T & { detail?: string; errors?: unknown };
  if (res.status === 401 || res.status === 403) throw new EinvoiceError("مفتاح وافق غير صحيح أو بدون صلاحية");
  if (!res.ok) throw new EinvoiceError(`وافق رفض الطلب (${res.status}): ${JSON.stringify(json?.detail ?? json?.errors ?? json ?? "").slice(0, 300)}`);
  return json;
}

/** Check the key, and list the accounts to pick the sales (revenue) account */
export async function wafeqAccounts(apiKey: string): Promise<{ id: string; name: string }[]> {
  const r = await wafeq<{ results?: { id: string; name?: string; name_ar?: string; name_en?: string; type?: string }[] }>(apiKey, "GET", "/accounts/?page_size=200");
  return (r.results ?? []).map((a) => ({ id: a.id, name: a.name_ar || a.name || a.name_en || a.id }));
}

/**
 * Send one finished trip's invoice. Never throws: the result is stored on the booking
 * (sent / reported / failed with the reason) and shown on the booking page with a "send again" button.
 */
export async function pushEinvoice(bookingId: string): Promise<Booking | null> {
  const b = await db.query.bookings.findFirst({ where: eq(s.bookings.id, bookingId) });
  if (!b?.invoiceNo) return null;
  const cfg = einvoiceConfig(await readSettings());
  if (!cfg) return b;
  if (b.einvoiceId && b.einvoiceStatus !== "failed") return b; // already there
  const save = (v: Partial<Pick<Booking, "einvoiceId" | "einvoiceStatus" | "einvoiceError">>) =>
    db.update(s.bookings).set({ ...v, updatedAt: new Date() }).where(eq(s.bookings.id, b.id)).returning().then((r) => r[0]);
  try {
    let invoiceId = b.einvoiceId;
    if (!invoiceId) {
      const contact = await wafeq<{ id: string }>(cfg.apiKey, "POST", "/contacts/", {
        name: b.customerName,
        phone: b.customerPhone,
        ...(b.customerEmail ? { email: b.customerEmail } : {}),
      });
      const day = (b.invoiceAt ?? new Date()).toISOString().slice(0, 10);
      const inv = await wafeq<{ id: string }>(cfg.apiKey, "POST", "/invoices/", {
        contact: contact.id,
        currency: "SAR",
        invoice_date: day,
        invoice_due_date: day,
        invoice_number: invoiceNo(b.invoiceNo),
        reference: b.ref,
        external_id: b.id,
        tax_amount_type: "TAX_EXCLUSIVE",
        notes: `${b.pickupDate} ${b.pickupTime}`,
        line_items: [
          {
            account: cfg.account,
            description: `${b.routeTitle} - ${b.vehicleName}`.slice(0, 250),
            quantity: 1,
            unit_amount: b.subtotal / 100,
            tax_rate: b.vatAmount > 0 && cfg.taxRate ? cfg.taxRate : null,
          },
        ],
      });
      invoiceId = inv.id;
      await save({ einvoiceId: invoiceId, einvoiceStatus: "sent", einvoiceError: null });
    }
    if (cfg.report) {
      await wafeq(cfg.apiKey, "POST", `/invoices/${invoiceId}/tax-authority/report/`, {});
      return save({ einvoiceStatus: "reported", einvoiceError: null });
    }
    return save({ einvoiceStatus: "sent", einvoiceError: null });
  } catch (e) {
    const msg = e instanceof EinvoiceError ? e.message : "خطأ غير متوقع";
    if (!(e instanceof EinvoiceError)) console.error("e-invoice failed", e);
    return save({ einvoiceStatus: "failed", einvoiceError: msg });
  }
}
