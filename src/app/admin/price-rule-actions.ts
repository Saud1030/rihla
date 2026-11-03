"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { invalidateCatalogCache } from "@/lib/catalog";
import { ruleTable, type RuleKind } from "@/lib/price-rules-server";
import type { ActionState } from "./actions";

const digits = (v: FormDataEntryValue | null) => String(v ?? "").replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).trim();
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const kindOf = (f: FormData): RuleKind => (f.get("kind") === "seasons" ? "seasons" : "offers");
const WORDS = {
  seasons: { one: "الموسم", pct: "نسبة الزيادة", max: 300, on: "تم تفعيل الموسم.", off: "تم إيقاف الموسم.", allOn: "تم تفعيل المواسم.", allOff: "تم إيقاف كل المواسم.", added: "تمت إضافة الموسم", name: "اكتب اسم الموسم." },
  offers: { one: "العرض", pct: "نسبة الخصم", max: 90, on: "تم تفعيل العرض.", off: "تم إيقاف العرض.", allOn: "تم تفعيل العروض.", allOff: "تم إيقاف كل العروض.", added: "تمت إضافة العرض", name: "اكتب اسم العرض." },
} as const;

function done(kind: RuleKind) {
  invalidateCatalogCache();
  revalidatePath(`/admin/${kind}`);
}

/** A whole list on or off at once (the switch at the top of the page) */
export async function setRulesEnabled(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("catalog");
  const kind = kindOf(formData);
  const on = formData.get("on") === "1";
  const key = `${kind}_enabled`;
  const value = on ? "1" : "0";
  await db.insert(s.settings).values({ key, value }).onConflictDoUpdate({ target: s.settings.key, set: { value } });
  done(kind);
  return { ok: true, message: on ? WORDS[kind].allOn : WORDS[kind].allOff };
}

function readRule(kind: RuleKind, formData: FormData) {
  const w = WORDS[kind];
  const nameAr = String(formData.get("nameAr") ?? "").trim().slice(0, 80);
  const nameEn = String(formData.get("nameEn") ?? "").trim().slice(0, 80);
  const percent = Number(digits(formData.get("percent")));
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  if (nameAr.length < 2) return { error: w.name } as const;
  if (!Number.isInteger(percent) || percent < 0 || percent > w.max) return { error: `${w.pct} رقم من ٠ إلى ${w.max.toLocaleString("ar-SA")}.` } as const;
  if (!isDate(startDate) || !isDate(endDate)) return { error: "اختر تاريخ البداية والنهاية." } as const;
  if (endDate < startDate) return { error: "تاريخ النهاية قبل البداية." } as const;
  return { values: { nameAr, nameEn, percent, startDate, endDate } } as const;
}

export async function addRule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("catalog");
  const kind = kindOf(formData);
  const r = readRule(kind, formData);
  if ("error" in r) return { error: r.error };
  await db.insert(ruleTable(kind)).values({ ...r.values, active: true });
  done(kind);
  return { ok: true, message: `${WORDS[kind].added} «${r.values.nameAr}».` };
}

export async function saveRule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("catalog");
  const kind = kindOf(formData);
  const r = readRule(kind, formData);
  if ("error" in r) return { error: r.error };
  const t = ruleTable(kind);
  const rows = await db.update(t).set(r.values).where(eq(t.id, Number(formData.get("id") ?? 0))).returning({ id: t.id });
  if (!rows.length) return { error: `${WORDS[kind].one} غير موجود.` };
  done(kind);
  return { ok: true, message: "تم الحفظ." };
}

/** One rule on or off by hand */
export async function toggleRule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("catalog");
  const kind = kindOf(formData);
  const on = formData.get("on") === "1";
  const t = ruleTable(kind);
  await db.update(t).set({ active: on }).where(eq(t.id, Number(formData.get("id") ?? 0)));
  done(kind);
  return { ok: true, message: on ? WORDS[kind].on : WORDS[kind].off };
}

export async function deleteRule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("catalog");
  const kind = kindOf(formData);
  const t = ruleTable(kind);
  await db.delete(t).where(eq(t.id, Number(formData.get("id") ?? 0)));
  done(kind);
  return { ok: true, message: "تم الحذف." };
}
