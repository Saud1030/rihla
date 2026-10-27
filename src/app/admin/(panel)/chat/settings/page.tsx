import Link from "next/link";
import { Suspense } from "react";
import { requireSection } from "@/lib/auth";
import { getSettings } from "@/lib/catalog";
import { listFaqsAdmin } from "@/lib/admin-data";
import { deleteFaq, saveChatSettings, saveFaq } from "../../../chat-actions";
import { ActionForm } from "@/components/admin/action-form";
import { Card, Field, PageHeader, Skeleton } from "@/components/admin/ui";
import type { ChatFaq } from "@/db/schema";

export default function ChatSettingsPage({ searchParams }: PageProps<"/admin/chat/settings">) {
  return (
    <>
      <Link href="/admin/chat" className="text-sm text-muted hover:text-ink">
        → المحادثات
      </Link>
      <div className="mt-3">
        <PageHeader title="بوت الاستفسارات" />
      </div>
      <Suspense fallback={<Skeleton h="h-96" />}>
        <Settings searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const HANDOFF: [string, string, string][] = [
  ["both", "داخل الموقع + واتساب", "يكتب العميل اسمه وجواله ويكلّم الموظف هنا، مع رابط واتساب كخيار إضافي."],
  ["live", "داخل الموقع فقط", "الموظف يرد من صفحة «المحادثات» في لوحة التحكم."],
  ["whatsapp", "واتساب فقط", "زر «تكلم مع موظف» يفتح واتساب برقم الشركة."],
  ["off", "بدون موظف", "البوت فقط."],
];

async function Settings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection("chat");
  const sp = await searchParams;
  const [st, faqs] = await Promise.all([getSettings(), listFaqsAdmin()]);
  const v = (k: string) => st[k] ?? "";
  return (
    <div className="space-y-8 max-w-4xl">
      <Card className="p-6">
        <h2 className="font-semibold mb-4">الإعدادات</h2>
        <ActionForm action={saveChatSettings} submitLabel="حفظ إعدادات البوت">
          <label className="flex items-start gap-3">
            <input type="checkbox" name="chat_enabled" defaultChecked={v("chat_enabled") === "1"} className="size-4 mt-1 accent-sign" />
            <span>
              <span className="block font-medium">تشغيل البوت في الموقع</span>
              <span className="block text-sm text-muted">عند إيقافه يظهر زر واتساب بدلًا منه.</span>
            </span>
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium mb-1">«تكلم مع موظف»</legend>
            {HANDOFF.map(([val, label, hint]) => (
              <label key={val} className="flex items-start gap-3 rounded-lg border border-line px-3 py-2 has-[:checked]:border-sign has-[:checked]:bg-sign-soft">
                <input type="radio" name="chat_handoff" value={val} defaultChecked={(v("chat_handoff") || "both") === val} className="mt-1 accent-sign" />
                <span>
                  <span className="block font-medium text-[15px]">{label}</span>
                  <span className="block text-xs text-muted">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="اسم البوت (عربي)">
              <input name="chat_bot_name_ar" defaultValue={v("chat_bot_name_ar")} maxLength={60} required className="field" />
            </Field>
            <Field label="اسم البوت (إنجليزي)">
              <input name="chat_bot_name_en" defaultValue={v("chat_bot_name_en")} maxLength={60} dir="ltr" className="field" />
            </Field>
            {(
              [
                ["chat_greeting", "رسالة الترحيب", "أول ما يراه العميل عند فتح المحادثة."],
                ["chat_fallback", "الرد إذا لم يجد البوت إجابة", "يظهر عندما يكتب العميل سؤالًا لا يطابق أي سؤال محفوظ."],
                ["chat_waiting", "رسالة التحويل للموظف", "تظهر للعميل بعد طلب موظف."],
              ] as const
            ).map(([k, label, hint]) => (
              <div key={k} className="contents">
                <Field label={`${label} (عربي)`} hint={hint}>
                  <textarea name={`${k}_ar`} defaultValue={v(`${k}_ar`)} rows={3} maxLength={600} required className="field" />
                </Field>
                <Field label={`${label} (إنجليزي)`}>
                  <textarea name={`${k}_en`} defaultValue={v(`${k}_en`)} rows={3} maxLength={600} dir="ltr" className="field" />
                </Field>
              </div>
            ))}
          </div>
        </ActionForm>
      </Card>

      <section id="faqs" className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">الأسئلة والإجابات</h2>
          <p className="text-sm text-muted mt-1 max-w-[70ch]">
            تظهر الأسئلة المفعّلة كأزرار في البوت. وإذا كتب العميل سؤالًا، يبحث البوت في الأسئلة والكلمات المفتاحية ويرد بأقرب إجابة. يمكنك كتابة {"{cancel_hours}"} و{"{cancel_percent}"} و
            {"{phone}"} في الإجابة، وتُستبدل تلقائيًا من الإعدادات.
          </p>
        </div>
        {(sp.added || sp.deleted) && (
          <p role="status" className="rounded-lg bg-sign-soft border border-sign/20 px-4 py-3 text-sign">
            {sp.added ? "تمت إضافة السؤال، ويظهر في البوت." : "تم حذف السؤال."}
          </p>
        )}
        <Card className="p-6">
          <h3 className="font-semibold mb-4">إضافة سؤال</h3>
          {/* remounts (empty) once the new question is in the list */}
          <FaqFields key={`new-${faqs.length}`} />
        </Card>
        {faqs.map((f) => (
          <Card key={f.id} className="p-0">
            <details>
              <summary className="cursor-pointer list-none flex flex-wrap items-center gap-3 px-6 py-4">
                <span className="font-medium flex-1 min-w-0">{f.questionAr}</span>
                {!f.active && <span className="text-xs text-danger">مخفي</span>}
                <span className="text-xs text-muted tabular">ترتيب {f.sortOrder}</span>
                <span className="text-sm text-sign">تعديل</span>
              </summary>
              <div className="px-6 pb-6 space-y-4 border-t border-line pt-4">
                <FaqFields f={f} />
                <ActionForm action={deleteFaq} submitLabel="حذف السؤال" submitClassName="text-sm text-danger hover:underline" pendingLabel="جارٍ الحذف…">
                  <input type="hidden" name="id" value={f.id} />
                </ActionForm>
              </div>
            </details>
          </Card>
        ))}
      </section>
    </div>
  );
}

function FaqFields({ f }: { f?: ChatFaq }) {
  return (
    <ActionForm action={saveFaq} submitLabel={f ? "حفظ السؤال" : "إضافة السؤال"}>
      {f && <input type="hidden" name="id" value={f.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="السؤال (عربي)">
          <input name="questionAr" defaultValue={f?.questionAr} maxLength={200} required className="field" />
        </Field>
        <Field label="السؤال (إنجليزي)">
          <input name="questionEn" defaultValue={f?.questionEn} maxLength={200} dir="ltr" className="field" />
        </Field>
        <Field label="الإجابة (عربي)">
          <textarea name="answerAr" defaultValue={f?.answerAr} rows={4} maxLength={2000} required className="field" />
        </Field>
        <Field label="الإجابة (إنجليزي)">
          <textarea name="answerEn" defaultValue={f?.answerEn} rows={4} maxLength={2000} dir="ltr" className="field" />
        </Field>
        <Field label="كلمات مفتاحية" hint="كلمات يكتبها العملاء عادة، مفصولة بفواصل. مثل: الغاء, استرداد, refund" className="sm:col-span-2">
          <input name="keywords" defaultValue={f?.keywords} maxLength={500} className="field" />
        </Field>
        <Field label="الترتيب" hint="الأصغر يظهر أولًا">
          <input name="sortOrder" type="number" min={0} max={999} defaultValue={f?.sortOrder ?? 0} className="field tabular" />
        </Field>
        <label className="flex items-center gap-2 self-end pb-3">
          <input type="checkbox" name="active" defaultChecked={f ? f.active : true} className="size-4 accent-sign" />
          <span>يظهر في البوت</span>
        </label>
      </div>
    </ActionForm>
  );
}
