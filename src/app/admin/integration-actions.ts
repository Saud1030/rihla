"use server";

import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { invalidateCatalogCache } from "@/lib/catalog";
import { EINVOICE_PLATFORMS, GATEWAYS, WHATSAPP } from "@/lib/integrations";
import { testWhatsApp } from "@/lib/notify";
import { normalizePhone } from "@/lib/phone";
import { readSettings } from "@/lib/notify";
import type { ActionState } from "./actions";

async function save(rows: Record<string, string>) {
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(rows)) await tx.insert(s.settings).values({ key, value }).onConflictDoUpdate({ target: s.settings.key, set: { value } });
  });
  invalidateCatalogCache();
  revalidatePath("/admin/integrations");
}

/** Which gateway takes online payments: none, or one that is connected and has its key */
export async function chooseGateway(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("settings");
  const id = String(formData.get("pay_gateway") ?? "");
  if (!id) {
    await save({ pay_gateway: "" });
    return { ok: true, message: "تم إيقاف الدفع الإلكتروني. العميل يدفع بالتحويل البنكي أو كاش." };
  }
  const g = GATEWAYS.find((x) => x.id === id);
  if (!g) return { error: "اختر بوابة من القائمة." };
  if (!g.ready) return { error: `${g.name} محفوظة، لكنها تحتاج ربط قبل التشغيل. اطلب ربطها ثم فعّلها.` };
  const st = await readSettings();
  if (id === "myfatoorah" && !(st.mf_api_key || process.env.MYFATOORAH_API_KEY)) return { error: "اكتب مفتاح API لماي فاتورة أولًا واحفظه." };
  await save({ pay_gateway: id });
  return { ok: true, message: `تم تشغيل ${g.name}. يظهر الدفع الإلكتروني للعملاء الآن.` };
}

/** The keys of one gateway or invoicing platform (a secret left empty keeps the saved one) */
export async function saveIntegrationKeys(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("settings");
  const id = String(formData.get("id") ?? "");
  const item = [...GATEWAYS, ...EINVOICE_PLATFORMS, WHATSAPP].find((x) => x.id === id);
  if (!item) return { error: "غير موجود." };
  const rows: Record<string, string> = {};
  for (const f of item.fields) {
    const v = String(formData.get(f.key) ?? "").trim().replace(/^Bearer\s+/i, "").slice(0, f.max ?? 300);
    if (f.options && v && !f.options.some(([o]) => o === v)) return { error: `${f.label}: اختيار غير صحيح.` };
    if (v && !f.options && !new RegExp(`^[\\w.\\-:/+=@]{2,${f.max ?? 300}}$`).test(v)) return { error: `${f.label}: قيمة غير صحيحة.` };
    if (f.secret && !v) continue; // keep the saved secret
    rows[f.key] = v;
  }
  if (formData.get("clear") === "1") for (const f of item.fields) rows[f.key] = "";
  await save(rows);
  return { ok: true, message: formData.get("clear") === "1" ? `تم حذف مفاتيح ${item.name}.` : item.ready ? `تم حفظ مفاتيح ${item.name}.` : `تم حفظ مفاتيح ${item.name}. تشتغل بعد ربطها.` };
}

/** Send Meta's ready "hello_world" message to a number, to check the WhatsApp keys */
export async function sendWhatsAppTest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("settings");
  const to = normalizePhone(String(formData.get("to") ?? ""));
  if (!to) return { error: "اكتب رقم جوال صحيح (مثل 0501234567 أو ‎+9665…)." };
  const st = await readSettings();
  const r = await testWhatsApp(to, st);
  return r.ok ? { ok: true, message: `تم الإرسال. تأكد أن رسالة "Hello World" وصلت على ${to}.` } : { error: r.error };
}
