"use server";

import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { getSettings, invalidateCatalogCache } from "@/lib/catalog";
import { disconnect, SCHEDULES, uploadReport, type Schedule } from "@/lib/gdrive";
import type { ActionState } from "./actions";

const put = async (values: Record<string, string>) => {
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(values)) await tx.insert(s.settings).values({ key, value }).onConflictDoUpdate({ target: s.settings.key, set: { value } });
  });
  invalidateCatalogCache();
  revalidatePath("/admin/integrations");
};

/** the Google Cloud app's Client ID and Secret (the secret is kept when left empty) */
export async function saveGdriveApp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("settings");
  const id = String(formData.get("clientId") ?? "").trim();
  const secret = String(formData.get("clientSecret") ?? "").trim();
  if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(id)) return { error: "Client ID ينتهي بـ ‎.apps.googleusercontent.com‎. انسخه كامل من Google Cloud." };
  const st = await getSettings();
  if (!secret && !st.gd_client_secret) return { error: "الصق Client Secret." };
  if (secret && secret.length > 200) return { error: "Client Secret طويل جدًا." };
  await put({ gd_client_id: id, ...(secret ? { gd_client_secret: secret } : {}) });
  return { ok: true, message: "تم الحفظ. اضغط «ربط حساب قوقل درايف»." };
}

export async function saveGdriveSchedule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("settings");
  const v = String(formData.get("schedule") ?? "off");
  if (!SCHEDULES.some(([k]) => k === v)) return { error: "اختر موعدًا." };
  await put({ gd_schedule: v as Schedule });
  return { ok: true, message: v === "off" ? "تم الحفظ: الرفع يدوي فقط." : "تم الحفظ: التقرير يرتفع تلقائيًا في موعده." };
}

export async function gdriveUploadNow(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("settings");
  const from = String(formData.get("from") ?? ""), to = String(formData.get("to") ?? "");
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (!date.test(from) || !date.test(to)) return { error: "اختر تاريخ البداية والنهاية." };
  if (from > to) return { error: "تاريخ البداية بعد تاريخ النهاية." };
  try {
    const r = await uploadReport(from, to);
    revalidatePath("/admin/integrations");
    return { ok: true, message: `تم رفع «${r.name}» (${r.count.toLocaleString("ar-SA")} حجز) إلى قوقل درايف.` };
  } catch (e) {
    revalidatePath("/admin/integrations");
    return { error: `تعذّر الرفع: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function gdriveDisconnect(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  await requireSection("settings");
  await disconnect();
  revalidatePath("/admin/integrations");
  return { ok: true, message: "تم فصل قوقل درايف. الملفات اللي ارتفعت باقية في حسابك." };
}

export async function gdriveForgetApp(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  await requireSection("settings");
  await disconnect();
  await put({ gd_client_id: "", gd_client_secret: "", gd_schedule: "off" });
  return { ok: true, message: "تم حذف بيانات تطبيق قوقل." };
}
