import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { changePassword } from "../../actions";
import { ROLE_LABELS } from "@/lib/permissions";
import { ActionForm } from "@/components/admin/action-form";
import { Card, Field, PageHeader, Skeleton } from "@/components/admin/ui";

export default function AccountPage() {
  return (
    <>
      <PageHeader title="حسابي" />
      <Suspense fallback={<Skeleton h="h-72" />}>
        <Account />
      </Suspense>
    </>
  );
}

async function Account() {
  const me = await requireAdmin();
  return (
    <div className="space-y-6 max-w-xl">
      <Card className="p-6">
        <dl className="space-y-2 text-[15px]">
          <div className="flex gap-3">
            <dt className="text-muted w-28">الاسم</dt>
            <dd>{me.name}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="text-muted w-28">اسم الدخول</dt>
            <dd dir="ltr">{me.email}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="text-muted w-28">نوع الحساب</dt>
            <dd>{ROLE_LABELS[me.role]}</dd>
          </div>
        </dl>
      </Card>
      <Card className="p-6">
        <h2 className="font-semibold mb-4">تغيير كلمة المرور</h2>
        <ActionForm action={changePassword} submitLabel="تغيير كلمة المرور">
          <Field label="كلمة المرور الحالية">
            <input name="current" type="password" required autoComplete="current-password" dir="ltr" className="field text-start" />
          </Field>
          <Field label="كلمة المرور الجديدة" hint="١٠ أحرف على الأقل">
            <input name="next" type="password" required minLength={10} autoComplete="new-password" dir="ltr" className="field text-start" />
          </Field>
        </ActionForm>
      </Card>
    </div>
  );
}
