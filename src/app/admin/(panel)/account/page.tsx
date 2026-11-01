import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { db, schema as sc } from "@/db";
import { changePassword } from "../../actions";
import { removeMyAvatar, saveMyAvatar } from "../../user-actions";
import { PhotoField } from "@/components/site/photo-field";
import { ROLE_LABELS } from "@/lib/permissions";
import { ActionForm } from "@/components/admin/action-form";
import { Card, Field, PageHeader, Skeleton } from "@/components/admin/ui";

const AVATAR_LABELS = {
  pick: "اختر صورة",
  change: "تغيير",
  tooBig: "الصورة كبيرة جدًا.",
  unreadable: "هذا الملف ليس صورة صالحة. اختر صورة PNG أو JPG أو WEBP.",
  cardSize: "",
  photoSize: "تُقص بشكل مربع وتظهر بجانب اسمك في أعلى لوحة التحكم.",
  crop: { cropTitle: "قص الصورة", cropHint: "اسحب الصورة وكبّرها حتى يملأ الوجه الإطار.", zoom: "تكبير", rotate: "تدوير", cropOk: "اعتماد", cancel: "إلغاء" },
};

export default function AccountPage({ searchParams }: PageProps<"/admin/account">) {
  return (
    <>
      <PageHeader title="حسابي" />
      <Suspense fallback={<Skeleton h="h-72" />}>
        <Account searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Account({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireAdmin();
  const removed = (await searchParams).avatar === "removed";
  const [avatar] = await db.select({ updatedAt: sc.assets.updatedAt }).from(sc.assets).where(eq(sc.assets.key, `avatar-${me.uid}`)).limit(1);
  return (
    <div className="space-y-6 max-w-xl">
      <Card className="p-6" data-testid="avatar-card">
        <h2 className="font-semibold mb-4">صورتك</h2>
        {removed && !avatar && (
          <p role="status" className="mb-4 text-sm text-sign">
            تم حذف الصورة.
          </p>
        )}
        <div className="flex flex-wrap items-start gap-5">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- our own API route
            <img src={`/api/admin/avatar/${me.uid}?v=${avatar.updatedAt.getTime()}`} alt="صورتك" className="size-20 rounded-full object-cover border border-line" />
          ) : (
            <span className="grid place-items-center size-20 rounded-full bg-sign-soft text-sign text-2xl font-semibold" aria-hidden>
              {me.name.trim().charAt(0)}
            </span>
          )}
          <div className="grow min-w-0 space-y-3">
            <ActionForm action={saveMyAvatar} submitLabel="حفظ الصورة">
              <PhotoField name="photo" label={avatar ? "صورة جديدة" : "اختر صورة"} t={AVATAR_LABELS} />
            </ActionForm>
            {avatar && (
              <ActionForm action={removeMyAvatar} submitLabel="حذف الصورة" submitClassName="text-sm text-danger hover:underline" className="">
                <span className="sr-only">حذف الصورة</span>
              </ActionForm>
            )}
          </div>
        </div>
      </Card>
      <Card className="p-6">
        <dl className="space-y-2 text-[15px]">
          <div className="flex gap-3">
            <dt className="text-muted w-28">الاسم</dt>
            <dd>{me.name}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="text-muted w-28">البريد الإلكتروني</dt>
            <dd dir="ltr">{me.mail || "—"}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="text-muted w-28">رقم الجوال</dt>
            <dd dir="ltr">{me.phone || "—"}</dd>
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
