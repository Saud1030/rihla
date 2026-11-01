import Link from "next/link";
import { Suspense } from "react";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { getSettings } from "@/lib/catalog";
import { emailConfigured, TEMPLATES, whatsappConfigured } from "@/lib/notify";
import { saveNotifySettings } from "../../notify-actions";
import { ActionForm } from "@/components/admin/action-form";
import { NotificationList } from "@/components/admin/notification-list";
import { Card, Field, PageHeader, Skeleton } from "@/components/admin/ui";

const FILTERS = [
  ["", "الكل"],
  ["pending", "جاهزة للإرسال اليدوي"],
  ["failed", "فشل الإرسال"],
  ["sent", "أُرسلت"],
] as const;

/** who / what the message is for */
const TYPES = [
  ["", "كل الأنواع"],
  ["customer", "رسائل العميل"],
  ["driver", "رسائل السائق"],
  ["whatsapp", "واتساب"],
  ["email", "البريد"],
  ["rating", "التقييم"],
] as const;
type TypeKey = Exclude<(typeof TYPES)[number][0], "">;
const CUSTOMER_KINDS = ["customer_driver", "rating_request", "payment_receipt", "trip_invoice"];
const DRIVER_KINDS = ["driver_trip", "driver_approved", "driver_rejected", "driver_suspended", "driver_blocked"];
const typeWhere = (t: TypeKey) =>
  t === "customer"
    ? inArray(s.notifications.kind, CUSTOMER_KINDS)
    : t === "driver"
      ? inArray(s.notifications.kind, DRIVER_KINDS)
      : t === "rating"
        ? inArray(s.notifications.kind, ["rating_request", "rating_received"])
        : eq(s.notifications.channel, t);

export default function MessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  return (
    <>
      <PageHeader title="رسائل واتساب والبريد" />
      <Suspense fallback={<Skeleton h="h-96" />}>
        <Messages searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Messages({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection("messages");
  const sp = await searchParams;
  const status = String(sp.status ?? "");
  const filter = (["pending", "failed", "sent"] as const).find((x) => x === status);
  const type = String(sp.type ?? "");
  const typeFilter = TYPES.map((x) => x[0]).find((x): x is TypeKey => x !== "" && x === type);
  const href = (p: { status?: string; type?: string }) => {
    const q = new URLSearchParams();
    const st = p.status ?? (filter ?? "");
    const ty = p.type ?? (typeFilter ?? "");
    if (st) q.set("status", st);
    if (ty) q.set("type", ty);
    return `/admin/messages${q.size ? `?${q}` : ""}`;
  };
  const [rows, st] = await Promise.all([
    db
      .select({ n: s.notifications, ref: s.bookings.ref, number: s.bookings.number })
      .from(s.notifications)
      .leftJoin(s.bookings, eq(s.bookings.id, s.notifications.bookingId))
      .where(and(filter ? eq(s.notifications.status, filter) : undefined, typeFilter ? typeWhere(typeFilter) : undefined))
      .orderBy(desc(s.notifications.id))
      .limit(100),
    getSettings(),
  ]);
  const wa = whatsappConfigured();
  const mail = emailConfigured();

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className={`p-4 ${wa ? "" : "border-amber border-2"}`}>
          <p className="font-medium">واتساب</p>
          <p className={`text-sm mt-1 ${wa ? "text-sign" : "text-amber-deep"}`}>
            {wa ? (st.wa_auto === "0" ? "مربوط، لكن الإرسال التلقائي متوقف" : "مربوط: الرسائل تُرسل تلقائيًا") : "غير مربوط: كل رسالة تنتظر ضغطة «إرسال عبر واتساب»"}
          </p>
        </Card>
        <Card className={`p-4 ${mail ? "" : "border-amber border-2"}`}>
          <p className="font-medium">البريد الإلكتروني</p>
          <p className={`text-sm mt-1 ${mail ? "text-sign" : "text-amber-deep"}`}>{mail ? "مربوط: التقييمات تصل لبريد الشركة تلقائيًا" : "غير مربوط: التقييمات تظهر هنا وفي لوحة التحكم"}</p>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-line">
          <h2 className="font-semibold me-auto">آخر الرسائل</h2>
          {FILTERS.map(([v, label]) => (
            <Link
              key={v}
              href={href({ status: v })}
              className={`rounded-full px-3 py-1 text-sm border ${(filter ?? "") === v ? "bg-sign text-white border-sign" : "border-line hover:border-sign"}`}
            >
              {label}
            </Link>
          ))}
        </div>
        <nav className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-line" aria-label="نوع الرسائل" data-testid="message-types">
          {TYPES.map(([v, label]) => (
            <Link
              key={v}
              href={href({ type: v })}
              aria-current={(typeFilter ?? "") === v ? "page" : undefined}
              className={`rounded-full px-3 py-1 text-sm border ${(typeFilter ?? "") === v ? "bg-ink text-white border-ink" : "border-line hover:border-sign"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <NotificationList rows={rows.map((r) => ({ ...r.n, ref: r.ref, number: r.number }))} showBooking />
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">الإعدادات</h2>
        <ActionForm action={saveNotifySettings} submitLabel="حفظ">
          <label className="flex items-start gap-3">
            <input type="checkbox" name="wa_auto" defaultChecked={st.wa_auto !== "0"} className="size-4 mt-1 accent-sign" />
            <span>
              <span className="block font-medium">إرسال رسائل واتساب تلقائيًا</span>
              <span className="block text-sm text-muted">عند إسناد السائق، وعند انتهاء الرحلة (طلب التقييم). يعمل بعد ربط واتساب للأعمال.</span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="rating_enabled" defaultChecked={st.rating_enabled !== "0"} className="size-4 mt-1 accent-sign" />
            <span>
              <span className="block font-medium">طلب التقييم من العميل بعد انتهاء الرحلة</span>
            </span>
          </label>
          <Field label="بريد الشركة لاستلام التقييمات" hint={`اتركه فارغًا لاستخدام بريد التواصل (${st.email || "غير محدد"})`}>
            <input name="notify_email" type="email" defaultValue={st.notify_email ?? ""} dir="ltr" className="field text-start" />
          </Field>
          <details className="rounded-lg border border-line p-4">
            <summary className="cursor-pointer font-medium">قوالب واتساب (للمطوّر أو عند الربط)</summary>
            <p className="text-sm text-muted mt-2 mb-4 max-w-[70ch]">
              واتساب يسمح ببدء المحادثة مع العميل أو السائق برسالة من قالب معتمد فقط. أنشئ القوالب التالية في Meta Business Manager (الفئة: Utility)، ثم اكتب اسم كل قالب هنا. إذا تُرك الاسم فارغًا تُرسل الرسالة نصًا عاديًا، وهذا يصل فقط لمن راسلكم خلال آخر ٢٤ ساعة.
            </p>
            <div className="space-y-5">
              <Field label="لغة القوالب" hint="ar للعربية">
                <input name="wa_template_lang" defaultValue={st.wa_template_lang || "ar"} dir="ltr" className="field text-start max-w-40" />
              </Field>
              {(Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]).map((k) => {
                const t = TEMPLATES[k];
                return (
                  <div key={k} className="space-y-2">
                    <Field label={{ driver_trip: "قالب رسالة السائق", customer_driver: "قالب رسالة العميل ببيانات السائق", rating_request: "قالب الفاتورة وطلب التقييم بعد الرحلة", payment_receipt: "قالب سند الدفع", trip_invoice: "قالب الفاتورة (إذا كان التقييم مقفلًا)" }[k]}>
                      <input name={t.setting} defaultValue={st[t.setting] ?? ""} placeholder={k} dir="ltr" className="field text-start" />
                    </Field>
                    <p className="text-xs text-muted">نص مقترح للقالب:</p>
                    <pre className="text-xs whitespace-pre-wrap bg-stone rounded-md px-3 py-2 font-sans">{t.suggested}</pre>
                  </div>
                );
              })}
            </div>
          </details>
        </ActionForm>
      </Card>
    </div>
  );
}
