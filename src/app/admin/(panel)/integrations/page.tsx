import { Suspense } from "react";
import { requireSection } from "@/lib/auth";
import { getSettings } from "@/lib/catalog";
import { maskKey } from "@/lib/einvoice";
import { EINVOICE_PLATFORMS, GATEWAYS, type Integration } from "@/lib/integrations";
import { saveEinvoiceSettings, testEinvoice } from "../../actions";
import { chooseGateway, saveIntegrationKeys } from "../../integration-actions";
import { ActionForm } from "@/components/admin/action-form";
import { Card, Field, PageHeader, Skeleton } from "@/components/admin/ui";

export default function IntegrationsPage() {
  return (
    <>
      <PageHeader title="بوابات الدفع والفوترة" />
      <Suspense fallback={<Skeleton h="h-[600px]" />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requireSection("settings");
  const values = await getSettings();
  const active = GATEWAYS.find((g) => g.id === values.pay_gateway) ?? null;
  const hasKeys = (g: Integration) => g.fields.some((f) => (values[f.key] ?? "").trim()) || (g.id === "myfatoorah" && !!process.env.MYFATOORAH_API_KEY);

  return (
    <div className="space-y-8 max-w-5xl">
      <section className="space-y-4" aria-labelledby="gw-title">
        <h2 id="gw-title" className="text-xl font-semibold">
          بوابة الدفع الإلكتروني
        </h2>
        <Card className={`p-5 ${active ? "" : "border-amber/50"}`} data-testid="gateway-choice">
          <p className="font-medium" data-testid="gateway-state">
            {active ? `الدفع الإلكتروني شغّال عبر ${active.name}.` : "الدفع الإلكتروني موقوف: العميل يدفع بالتحويل البنكي أو كاش للسائق."}
          </p>
          <p className="text-sm text-muted mt-1 mb-3">اختر البوابة اللي تستقبل الدفع بالبطاقة (مدى، فيزا، Apple Pay…). احفظ مفاتيحها تحت أولًا.</p>
          <ActionForm action={chooseGateway} submitLabel="حفظ" className="flex flex-wrap items-end gap-3">
            <label className="block min-w-64">
              <span className="block text-sm font-medium mb-1">البوابة المستخدمة</span>
              <select name="pay_gateway" defaultValue={active?.id ?? ""} className="field">
                <option value="">بدون (الدفع الإلكتروني موقوف)</option>
                {GATEWAYS.map((g) => (
                  <option key={g.id} value={g.id} disabled={!g.ready}>
                    {g.name}
                    {g.ready ? "" : " (تحتاج ربط)"}
                  </option>
                ))}
              </select>
            </label>
          </ActionForm>
        </Card>
        <div className="grid gap-4 md:grid-cols-2">
          {GATEWAYS.map((g) => (
            <IntegrationCard key={g.id} g={g} values={values} on={active?.id === g.id} saved={hasKeys(g)} />
          ))}
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="einv-title">
        <h2 id="einv-title" className="text-xl font-semibold">
          الفوترة الإلكترونية
        </h2>
        <Card className="p-6" data-testid="einvoice-settings">
          <h2 className="font-semibold mb-1">الفوترة الإلكترونية (منصة خارجية)</h2>
          <p className="text-sm text-muted mb-4 max-w-[75ch]">
            لما تنتهي الرحلة تصدر فاتورتها هنا، وتنرسل نفس الفاتورة تلقائيًا لمنصة <a href="https://wafeq.com" target="_blank" rel="noopener noreferrer" className="text-sign underline">وافق</a> عن طريق API (العميل، الوصف، المبلغ والضريبة)،
            ووافق يصدرها فاتورة إلكترونية معتمدة من هيئة الزكاة (فاتورة). المفتاح من وافق: الإعدادات ← API.
          </p>
          <ActionForm action={saveEinvoiceSettings} submitLabel="حفظ">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="المنصة">
                <select name="einv_provider" defaultValue={values.einv_provider ?? ""} className="field">
                  <option value="">بدون (الفاتورة من الموقع فقط)</option>
                  <option value="wafeq">وافق Wafeq</option>
                  {EINVOICE_PLATFORMS.filter((x) => !x.ready).map((x) => (
                    <option key={x.id} value={x.id} disabled>
                      {x.name} (تحتاج ربط)
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="مفتاح API" hint={values.wafeq_api_key ? `المحفوظ: ${maskKey(values.wafeq_api_key)} (اتركه فاضي لإبقائه)` : "من وافق: الإعدادات ← API Keys"}>
                <input name="wafeq_api_key" type="password" autoComplete="off" maxLength={200} className="field" dir="ltr" />
              </Field>
              <Field label="حساب المبيعات (الإيرادات) في وافق" hint="مثل acc_… — اضغط «اختبار الاتصال» يعرض لك الحسابات">
                <input name="wafeq_account" maxLength={100} defaultValue={values.wafeq_account ?? ""} className="field" dir="ltr" />
              </Field>
              <Field label="معرّف ضريبة ١٥٪ في وافق (اختياري)" hint="مثل tax_… — بدونه تنرسل الفاتورة بدون ضريبة على البند">
                <input name="wafeq_tax_rate" maxLength={100} defaultValue={values.wafeq_tax_rate ?? ""} className="field" dir="ltr" />
              </Field>
              <label className="flex items-center gap-2 sm:col-span-2">
                <input type="checkbox" name="einv_report" defaultChecked={values.einv_report === "1"} className="size-4 accent-sign" />
                إبلاغ هيئة الزكاة (فاتورة) تلقائيًا بعد إنشاء الفاتورة في وافق
              </label>
            </div>
          </ActionForm>
          <ActionForm action={testEinvoice} submitLabel="اختبار الاتصال" submitClassName="btn btn-ghost border border-line mt-3" className="">
            <span />
          </ActionForm>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {EINVOICE_PLATFORMS.filter((x) => !x.ready).map((g) => (
            <IntegrationCard key={g.id} g={g} values={values} on={false} saved={hasKeys(g)} />
          ))}
        </div>
      </section>
    </div>
  );
}

/** One gateway or platform: whether it is connected, its keys (secrets shown masked), save or clear */
function IntegrationCard({ g, values, on, saved }: { g: Integration; values: Record<string, string>; on: boolean; saved: boolean }) {
  return (
    <Card className="p-5 space-y-3" data-integration={g.id}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{g.name}</h3>
        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${g.ready ? "bg-sign-soft text-sign" : "bg-stone text-muted"}`}>{g.ready ? "مربوطة وجاهزة" : "تحتاج ربط"}</span>
        {on && <span className="rounded-md px-2 py-0.5 text-xs font-medium bg-amber/20 text-amber-deep">مفعّلة الآن</span>}
        {saved && <span className="text-xs text-muted">المفاتيح محفوظة</span>}
        <a href={g.site} target="_blank" rel="noopener noreferrer" className="ms-auto text-xs text-sign hover:underline">
          الموقع
        </a>
      </div>
      {!g.ready && <p className="text-xs text-muted">احفظ مفاتيحها من الآن؛ تشتغل بعد ما نربطها في الموقع (تعديل برمجي بسيط).</p>}
      <ActionForm action={saveIntegrationKeys} submitLabel="حفظ المفاتيح" submitClassName="btn btn-primary !min-h-9 !py-1 text-sm" className="space-y-3">
        <input type="hidden" name="id" value={g.id} />
        {g.fields.map((f) => (
          <Field key={f.key} label={f.label} hint={f.secret && values[f.key] ? `المحفوظ: ${maskKey(values[f.key])} (اتركه فاضي لإبقائه)` : f.hint}>
            {f.options ? (
              <select name={f.key} defaultValue={values[f.key] ?? f.options[0][0]} className="field">
                {f.options.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            ) : (
              <input name={f.key} type={f.secret ? "password" : "text"} autoComplete="off" defaultValue={f.secret ? "" : (values[f.key] ?? "")} maxLength={300} dir="ltr" className="field text-start" />
            )}
          </Field>
        ))}
      </ActionForm>
      {saved && (
        <ActionForm action={saveIntegrationKeys} submitLabel="حذف المفاتيح" submitClassName="btn btn-ghost !min-h-8 !py-0.5 text-xs !text-danger" className="">
          <input type="hidden" name="id" value={g.id} />
          <input type="hidden" name="clear" value="1" />
        </ActionForm>
      )}
    </Card>
  );
}
