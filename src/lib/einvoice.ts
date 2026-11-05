import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Booking } from "@/db/schema";
import { invoiceNo } from "./documents";
import { readSettings } from "./notify";

class EinvoiceError extends Error {}

/**
 * Tax invoices through an e-invoicing platform (Admin -> Settings -> E-invoicing). Today: Wafeq (wafeq.com),
 * a Saudi accounting platform that issues ZATCA e-invoices. When a trip ends and our own invoice number is given,
 * the same invoice is created there (customer, line, VAT), and optionally reported to ZATCA.
 * API: https://developer.wafeq.com — Authorization: Api-Key <key>.
 */

export const WAFEQ_BASE = (process.env.WAFEQ_API_BASE || "https://api.wafeq.com/v1").replace(/\/$/, "");

export type AlostazConfig = { provider: "alostaz"; baseUrl: string; token: string; branchId: string; productId: number; storehouseId: number; taxId: number | null; report: boolean };
export type EinvoiceConfig = { provider: "wafeq"; apiKey: string; account: string; taxRate: string; report: boolean } | AlostazConfig | null;

export function einvoiceConfig(st: Record<string, string>): EinvoiceConfig {
  if (st.einv_provider === "alostaz") {
    const productId = Number(st.alostaz_product_id);
    const storehouseId = Number(st.alostaz_storehouse_id);
    if (!st.alostaz_base_url || !st.alostaz_token || !productId || !storehouseId) return null;
    return {
      provider: "alostaz",
      baseUrl: st.alostaz_base_url.replace(/\/$/, ""),
      token: st.alostaz_token,
      branchId: st.alostaz_branch_id || "1",
      productId,
      storehouseId,
      taxId: Number(st.alostaz_tax_id) || null,
      report: st.einv_report === "1",
    };
  }
  if (st.einv_provider !== "wafeq" || !st.wafeq_api_key || !st.wafeq_account) return null;
  return { provider: "wafeq", apiKey: st.wafeq_api_key, account: st.wafeq_account, taxRate: st.wafeq_tax_rate ?? "", report: st.einv_report === "1" };
}

/* ---------- Alostaz (alostaz.io, برنامج الأستاذ المحاسبي) ----------
 * API: https://api.developers.alostaz.io — the base URL and a Bearer token come from the Alostaz dashboard:
 * Settings -> API Integration -> new API Client. Every request also carries the branch, language and API version.
 * Amounts are in halalas (cents), the same as ours.
 */
type AlostazConn = { baseUrl: string; token: string; branchId: string };

async function alostaz<T>(c: AlostazConn, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${c.baseUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${c.token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Branch-Id": c.branchId || "1",
        "X-Locale": "ar",
        "X-API-Version": "1.0.0",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new EinvoiceError("تعذّر الوصول إلى الأستاذ (تأكد من رابط API)");
  }
  const json = (await res.json().catch(() => null)) as (T & { message?: string; errors?: unknown }) | null;
  if (res.status === 401) throw new EinvoiceError("توكن الأستاذ غير صحيح أو منتهي");
  if (res.status === 403) throw new EinvoiceError(`الأستاذ رفض الصلاحية (403): ${String(json?.message ?? "تأكد من رقم الفرع وصلاحيات عميل API").slice(0, 200)}`);
  if (!res.ok) throw new EinvoiceError(`الأستاذ رفض الطلب (${res.status}): ${JSON.stringify(json?.errors ?? json?.message ?? json ?? "").slice(0, 300)}`);
  return (json ?? {}) as T;
}

/** a record or a list, with or without Laravel's { data: ... } wrapper */
const unwrap = <T>(r: unknown): T => ((r && typeof r === "object" && "data" in r ? (r as { data: T }).data : r) as T);
type Row = { id: number; name?: string; name_ar?: string; name_en?: string; [k: string]: unknown };
const rowName = (x: Row) => String(x.name_ar ?? x.name ?? x.name_en ?? x.id);

/**
 * "Test and set up": checks the token, then picks what every invoice line needs — the 15% VAT,
 * a storehouse, and a "transport service" product (made once, no stock) — and returns their ids.
 */
export async function alostazSetup(c: AlostazConn) {
  const [taxes, stores, products] = await Promise.all([
    alostaz<unknown>(c, "GET", "/taxes").then((r) => unwrap<Row[]>(r) ?? []),
    alostaz<unknown>(c, "GET", "/storehouses").then((r) => unwrap<Row[]>(r) ?? []),
    alostaz<unknown>(c, "GET", "/products?search=" + encodeURIComponent("خدمة نقل")).then((r) => unwrap<Row[]>(r) ?? []),
  ]);
  // the 15% VAT: a numeric field equal to 15 (percentage / rate / amount), or "15" in its name
  const tax =
    taxes.find((t) => Object.entries(t).some(([k, v]) => k !== "id" && (v === 15 || v === "15" || v === 15.0 || v === "15.00" || v === 1500))) ??
    taxes.find((t) => /15/.test(rowName(t))) ??
    null;
  const store = stores[0];
  if (!store) throw new EinvoiceError("ما فيه مستودع في الأستاذ. أضف مستودعًا (حتى لو للخدمات) ثم جرّب مرة ثانية.");
  let product = products.find((p) => rowName(p).includes("خدمة نقل"));
  if (!product)
    product = unwrap<Row>(
      await alostaz<unknown>(c, "POST", "/products", {
        name: "خدمة نقل",
        description: "رحلات النقل من موقع الحجز",
        supports_inventory: 0,
        is_bundle: 0,
        units: [{ content: 1 }],
        ...(tax ? { taxes: [{ id: tax.id }] } : {}),
      }),
    );
  return { taxes: taxes.map((t) => ({ id: t.id, name: rowName(t) })), tax: tax ? { id: tax.id, name: rowName(tax) } : null, store: { id: store.id, name: rowName(store) }, product: { id: product.id, name: rowName(product) } };
}

async function pushAlostaz(cfg: AlostazConfig, b: Booking): Promise<{ id: string; reported: boolean }> {
  let invoiceId = b.einvoiceId;
  if (!invoiceId) {
    const partner = unwrap<Row>(
      await alostaz<unknown>(cfg, "POST", "/partners", {
        type: "client",
        name: b.customerName,
        nature: "individual",
        contacts: [{ name: b.customerName, mobile: b.customerPhone, ...(b.customerEmail ? { email: b.customerEmail } : {}), country: "SA" }],
      }),
    );
    const at = (b.invoiceAt ?? new Date()).toISOString();
    const inv = unwrap<Row>(
      await alostaz<unknown>(cfg, "POST", "/invoices", {
        variant: "standard",
        nature: "sale",
        type: "invoice",
        status: "issued",
        code: invoiceNo(b.invoiceNo),
        partner_id: partner.id,
        partner_reference_code: b.ref,
        issue_date: at,
        due_date: at,
        notes: `حجز ${b.ref} · ${b.pickupDate} ${b.pickupTime}`,
        line_items: [
          {
            product_id: cfg.productId,
            storehouse_id: cfg.storehouseId,
            description: `${b.routeTitle} - ${b.vehicleName}`.slice(0, 250),
            unit_quantity: 1,
            unit_content: 1,
            // before VAT, in halalas (the platform's "cents")
            unit_price: b.subtotal,
            ...(b.vatAmount > 0 && cfg.taxId ? { taxes: [{ id: cfg.taxId }] } : {}),
          },
        ],
      }),
    );
    invoiceId = String(inv.id);
    await db.update(s.bookings).set({ einvoiceId: invoiceId, einvoiceStatus: "sent", einvoiceError: null, updatedAt: new Date() }).where(eq(s.bookings.id, b.id));
  }
  if (cfg.report) await alostaz(cfg, "POST", "/helpers/zatca/submit", { invoice_id: Number(invoiceId) || invoiceId });
  return { id: invoiceId, reported: cfg.report };
}

/** "abcd…wxyz" for the settings page */
export const maskKey = (k: string) => (k.length > 10 ? `${k.slice(0, 4)}…${k.slice(-4)}` : k ? "••••" : "");


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
    if (cfg.provider === "alostaz") {
      const r = await pushAlostaz(cfg, b);
      return save({ einvoiceId: r.id, einvoiceStatus: r.reported ? "reported" : "sent", einvoiceError: null });
    }
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
