"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { isSection } from "@/lib/permissions";
import { normalizePhone } from "@/lib/phone";
import type { ActionState } from "./actions";

/** Sign-in name: an email (lower case) or a mobile number (+966...) */
function cleanLogin(v: string) {
  const t = v.trim().toLowerCase();
  if (t.includes("@")) return z.email().max(200).safeParse(t).success ? t : null;
  return normalizePhone(t);
}

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  role: z.enum(["owner", "staff", "driver"]),
  active: z.boolean(),
});

async function activeOwners(exceptId = 0) {
  const rows = await db
    .select({ id: s.adminUsers.id })
    .from(s.adminUsers)
    .where(and(eq(s.adminUsers.role, "owner"), eq(s.adminUsers.active, true), ne(s.adminUsers.id, exceptId)));
  return rows.length;
}

/** Add an account or edit one (empty password = keep the current one) */
export async function saveUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("users");
  const id = Number(formData.get("id") ?? 0);
  const parsed = schema.safeParse({ name: formData.get("name"), role: formData.get("role"), active: formData.get("active") === "on" });
  if (!parsed.success) return { error: "اكتب الاسم واختر نوع الحساب." };
  const { name, role, active } = parsed.data;
  const login = cleanLogin(String(formData.get("login") ?? ""));
  if (!login) return { error: "اسم الدخول يجب أن يكون بريدًا إلكترونيًا صحيحًا أو رقم جوال (مثل 0501234567)." };
  const password = String(formData.get("password") ?? "");
  if ((!id || password) && password.length < 10) return { error: "كلمة المرور ١٠ أحرف على الأقل." };
  const permissions = role === "staff" ? formData.getAll("permissions").map(String).filter(isSection) : [];
  if (role === "staff" && !permissions.length) return { error: "اختر قسمًا واحدًا على الأقل لهذا الموظف." };
  const driverId = role === "driver" ? Number(formData.get("driverId") ?? 0) : 0;
  if (role === "driver") {
    if (!driverId) return { error: "اختر السائق المرتبط بهذا الحساب." };
    const taken = await db.query.adminUsers.findFirst({ where: and(eq(s.adminUsers.driverId, driverId), ne(s.adminUsers.id, id)) });
    if (taken) return { error: "لهذا السائق حساب دخول من قبل." };
  }

  const clash = await db.query.adminUsers.findFirst({ where: and(eq(s.adminUsers.email, login), ne(s.adminUsers.id, id)) });
  if (clash) return { error: "اسم الدخول مستخدم في حساب آخر." };

  if (id) {
    const current = await db.query.adminUsers.findFirst({ where: eq(s.adminUsers.id, id) });
    if (!current) return { error: "الحساب غير موجود." };
    if (id === me.uid && (role !== "owner" || !active)) return { error: "لا يمكنك إزالة صلاحية المدير أو إيقاف حسابك أنت." };
    if (current.role === "owner" && (role !== "owner" || !active) && (await activeOwners(id)) === 0) return { error: "يجب أن يبقى مدير واحد على الأقل." };
    await db
      .update(s.adminUsers)
      .set({
        name,
        email: login,
        role,
        permissions,
        driverId: driverId || null,
        active,
        ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}),
      })
      .where(eq(s.adminUsers.id, id));
    revalidatePath("/admin/users");
    return { ok: true, message: "تم حفظ الحساب." };
  }
  await db.insert(s.adminUsers).values({ name, email: login, role, permissions, driverId: driverId || null, active, passwordHash: await bcrypt.hash(password, 12) });
  redirect("/admin/users?added=1");
}

export async function deleteUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("users");
  const id = Number(formData.get("id") ?? 0);
  if (id === me.uid) return { error: "لا يمكنك حذف حسابك أنت." };
  const u = await db.query.adminUsers.findFirst({ where: eq(s.adminUsers.id, id) });
  if (!u) return { error: "الحساب غير موجود." };
  if (u.role === "owner" && (await activeOwners(id)) === 0) return { error: "يجب أن يبقى مدير واحد على الأقل." };
  await db.delete(s.adminUsers).where(eq(s.adminUsers.id, id));
  redirect("/admin/users?deleted=1");
}
