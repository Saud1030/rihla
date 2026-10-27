import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { ROLE_LABELS, SECTIONS } from "@/lib/permissions";
import { deleteUser } from "../../user-actions";
import { ActionForm } from "@/components/admin/action-form";
import { UserFields } from "@/components/admin/user-fields";
import { Card, PageHeader, Skeleton } from "@/components/admin/ui";

export default function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <>
      <PageHeader title="المستخدمين والصلاحيات" />
      <Suspense fallback={<Skeleton h="h-96" />}>
        <Users searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Users({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireSection("users");
  const sp = await searchParams;
  const [users, drivers] = await Promise.all([
    db
      .select({
        id: s.adminUsers.id,
        name: s.adminUsers.name,
        email: s.adminUsers.email,
        role: s.adminUsers.role,
        permissions: s.adminUsers.permissions,
        driverId: s.adminUsers.driverId,
        active: s.adminUsers.active,
      })
      .from(s.adminUsers)
      .orderBy(asc(s.adminUsers.role), asc(s.adminUsers.id)),
    db.select({ id: s.drivers.id, name: s.drivers.name }).from(s.drivers).orderBy(asc(s.drivers.name)),
  ]);
  const driverName = new Map(drivers.map((d) => [d.id, d.name]));
  const secLabel = new Map<string, string>(SECTIONS.map((x) => [x.key, x.label]));

  return (
    <div className="space-y-6 max-w-4xl">
      <p className="text-muted max-w-[70ch]">
        أضف موظفين وحدد لكل واحد الأقسام التي يدخلها، أو أنشئ حسابًا لسائق ليرى رحلاته فقط. كل حساب يدخل من صفحة الدخول نفسها: <bdi dir="ltr">/admin</bdi>
      </p>
      {(sp.added || sp.deleted) && (
        <p role="status" className="rounded-lg bg-sign-soft border border-sign/20 px-4 py-3 text-sign">
          {sp.added ? "تمت إضافة الحساب. أعطِ صاحبه اسم الدخول وكلمة المرور." : "تم حذف الحساب."}
        </p>
      )}
      <Card className="p-6">
        <h2 className="font-semibold mb-4">إضافة حساب</h2>
        <UserFields key={`new-${users.length}`} drivers={drivers} />
      </Card>

      <ul className="space-y-3" data-testid="user-list">
        {users.map((u) => (
          <li key={u.id}>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-medium">
                    {u.name} {u.id === me.uid && <span className="text-xs text-muted">(أنت)</span>}
                  </p>
                  <p className="text-sm text-muted" dir="ltr" style={{ textAlign: "right" }}>
                    {u.email}
                  </p>
                  <p className="text-sm mt-1">
                    <span className="font-medium">{ROLE_LABELS[u.role]}</span>
                    {u.role === "staff" && <span className="text-muted"> · {u.permissions.map((p) => secLabel.get(p) ?? p).join("، ")}</span>}
                    {u.role === "driver" && <span className="text-muted"> · {u.driverId ? driverName.get(u.driverId) : "غير مرتبط بسائق"}</span>}
                    {!u.active && <span className="text-danger"> · موقوف</span>}
                  </p>
                </div>
                {u.id !== me.uid && (
                  <ActionForm action={deleteUser} submitLabel="حذف" pendingLabel="جارٍ الحذف…" submitClassName="btn btn-ghost !min-h-9 !py-1 text-sm !text-danger" className="">
                    <input type="hidden" name="id" value={u.id} />
                  </ActionForm>
                )}
              </div>
              <details className="border-t border-line">
                <summary className="cursor-pointer px-5 py-3 text-sm text-sign">تعديل الحساب والصلاحيات</summary>
                <div className="px-5 pb-5">
                  <UserFields u={u} drivers={drivers} />
                </div>
              </details>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
