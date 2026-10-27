"use client";

import { useState } from "react";
import { ActionForm } from "./action-form";
import { Field } from "./ui";
import { saveUser } from "@/app/admin/user-actions";
import { ROLE_LABELS, SECTIONS, type Role } from "@/lib/permissions";

export type UserRow = { id: number; name: string; email: string; role: Role; permissions: string[]; driverId: number | null; active: boolean };

/** Add / edit an account: staff pick their sections, drivers pick which driver they are */
export function UserFields({ u, drivers }: { u?: UserRow; drivers: { id: number; name: string }[] }) {
  const [role, setRole] = useState<Role>(u?.role ?? "staff");
  return (
    <ActionForm action={saveUser} submitLabel={u ? "حفظ الحساب" : "إضافة الحساب"}>
      {u && <input type="hidden" name="id" value={u.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="الاسم">
          <input name="name" required minLength={2} maxLength={80} defaultValue={u?.name} className="field" />
        </Field>
        <Field label="اسم الدخول" hint="بريد إلكتروني، أو رقم جوال للسائقين مثل 0501234567">
          <input name="login" required maxLength={200} defaultValue={u?.email} dir="ltr" className="field text-start" autoComplete="off" />
        </Field>
        <Field label={u ? "كلمة مرور جديدة (اختياري)" : "كلمة المرور"} hint="١٠ أحرف على الأقل">
          <input name="password" type="password" minLength={10} required={!u} dir="ltr" className="field text-start" autoComplete="new-password" />
        </Field>
        <Field label="نوع الحساب">
          <select name="role" value={role} onChange={(e) => setRole(e.target.value as Role)} className="field">
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {role === "staff" && (
        <fieldset className="rounded-lg border border-line p-4">
          <legend className="px-1 text-sm font-medium">الأقسام المسموحة</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {SECTIONS.map((sec) => (
              <label key={sec.key} className="flex items-center gap-2">
                <input type="checkbox" name="permissions" value={sec.key} defaultChecked={u?.permissions.includes(sec.key)} className="size-4 accent-sign" />
                {sec.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {role === "driver" && (
        <Field label="السائق" hint="السائق يرى رحلاته فقط، ويسجّل بدء الرحلة وانتهاءها.">
          <select name="driverId" defaultValue={u?.driverId ?? ""} required className="field">
            <option value="">اختر السائق</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {role === "owner" && <p className="text-sm text-muted">المدير يدخل كل الأقسام ويضيف المستخدمين.</p>}
      <label className="flex items-center gap-2">
        <input type="checkbox" name="active" defaultChecked={u?.active ?? true} className="size-4 accent-sign" />
        الحساب مفعّل (إلغاء التفعيل يمنع الدخول فورًا)
      </label>
    </ActionForm>
  );
}
