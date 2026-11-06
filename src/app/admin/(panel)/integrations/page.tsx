import { Suspense } from "react";
import { requireSection } from "@/lib/auth";
import { getSettings } from "@/lib/catalog";
import { maskKey } from "@/lib/einvoice";
import { EINVOICE_PLATFORMS, GATEWAYS, WATI, WHATSAPP, type Integration } from "@/lib/integrations";
import { watiConfig, whatsappConfigured } from "@/lib/notify";
import { saveEinvoiceSettings, testEinvoice } from "../../actions";
import { chooseGateway, saveIntegrationKeys, sendWhatsAppTest } from "../../integration-actions";
import { ActionForm } from "@/components/admin/action-form";
import { Card, Field, PageHeader, Skeleton } from "@/components/admin/ui";

export default function IntegrationsPage() {
  return (
    <>
      <PageHeader title="بوابات الدفع والفوترة والواتساب" />
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
  const hasKeys = (g: Integration) =>
    g.fields.some((f) => (values[f.key] ?? "").trim()) || (g.id === "myfatoorah" && !!process.env.MYFATOORAH_API_KEY) || (g.id === "whatsapp" && !!process.env.WHATSAPP_TOKEN);
  const waOn = whatsappConfigured(values);
  const viaWati = !!watiConfig(values);

  return (
    <div className="space-y-8 max-w-5xl">
      {/* the company's WhatsApp number, through Meta's Cloud API */}
      <section className="space-y-4" aria-labelledby="wa-title" data-testid="whatsapp-settings">
        <h2 id="wa-title" className="text-xl font-semibold">
          رقم الواتساب (API)
        </h2>
        <Card className={`p-5 space-y-2 ${waOn ? "" : "border-amber/50"}`}>
          <p className="font-medium" data-testid="whatsapp-state">
            {waOn
              ? `الواتساب مربوط${viaWati ? " عن طريق WATI" : " عن طريق Meta"}: رسائل الحجز والسندات تنرسل تلقائيًا من رقمك.`
              : "الواتساب غير مربوط: الرسائل تُحفظ في «رسائل واتساب والبريد» وترسلها بنفسك."}
          </p>
          <ol className="text-sm text-muted list-decimal ps-5 space-y-1">
            <li>
              أنشئ تطبيقًا في{" "}
              <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-sign underline">
                Meta for Developers
              </a>{" "}
              (نوع Business) وأضف له منتج WhatsApp.
            </li>
            <li>من WhatsApp ← API Setup: أضف رقمك ووثّقه بكود SMS، وانسخ «Phone Number ID».</li>
            <li>من Business Settings ← System users: أنشئ مستخدمًا وولّد Access Token دائم بصلاحية whatsapp_business_messaging.</li>
            <li>الصق القيم تحت واحفظ، ثم «إرسال رسالة تجريبية» لجوالك.</li>
            <li>
              للعملاء اللي ما راسلوك قبل: اعتمد قوالب الرسائل في Meta واكتب أسماءها في{" "}
              <a href="/admin/messages" className="text-sign underline">
                رسائل واتساب والبريد
              </a>
              .
            </li>
          </ol>
          <p className="text-xs text-muted">ملاحظة: الرقم اللي تربطه بالـAPI ما يشتغل بعدها في تطبيق واتساب العادي على الجوال.</p>
          <p className="text-sm">
            <strong>أسهل:</strong> عن طريق <strong>WATI</strong> (يسجّل رقمك عند Meta بدالك): الصق «API Endpoint» و«API Token» من WATI في بطاقته تحت. إذا انحفظت مفاتيح WATI يُستخدم بدل Meta.
            القوالب تعتمدها من WATI بنفس الأسماء وترتيب {"{{1}} {{2}}"} المكتوب في «رسائل واتساب والبريد».
          </p>
        </Card>
        <div className="grid gap-4 md:grid-cols-2">
          <IntegrationCard g={WATI} values={values} on={viaWati} saved={hasKeys(WATI)} />
          <IntegrationCard g={WHATSAPP} values={values} on={waOn && !viaWati} saved={hasKeys(WHATSAPP)} />
          <Card className="p-5 space-y-3" data-testid="whatsapp-test">
            <h3 className="font-semibold">إرسال رسالة تجريبية</h3>
            <p className="text-sm text-muted">{viaWati ? "مع WATI: نتأكد من التوكن ونعرض لك أسماء قوالبك المعتمدة (ما تنرسل رسالة)." : "تنرسل رسالة Meta الجاهزة «Hello World» للرقم، وتتأكد إن الربط شغّال."}</p>
            <ActionForm action={sendWhatsAppTest} submitLabel={viaWati ? "اختبار الاتصال" : "إرسال رسالة تجريبية"} pendingLabel="جارٍ الإرسال…" className="space-y-3">
              <Field label="رقم جوالك">
                <input name="to" required inputMode="tel" dir="ltr" placeholder="0501234567" className="field text-start" />
              </Field>
            </ActionForm>
          </Card>
        </div>
      </section>

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
            لما تنتهي الرحلة تصدر فاتورتها هنا، وتنرسل نفس الفاتورة تلقائيًا لمنصة الفوترة اللي تختارها عن طريق API (العميل، الوصف، المبلغ والضريبة)،
            والمنصة تصدرها فاتورة إلكترونية معتمدة من هيئة الزكاة (فاتورة).
          </p>
          <ActionForm action={saveEinvoiceSettings} submitLabel="حفظ">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="المنصة">
                <select name="einv_provider" defaultValue={values.einv_provider ?? ""} className="field">
                  <option value="">بدون (الفاتورة من الموقع فقط)</option>
                  <option value="alostaz">الأستاذ alostaz.io</option>
                  <option value="wafeq">وافق Wafeq</option>
                  {EINVOICE_PLATFORMS.filter((x) => !x.ready).map((x) => (
                    <option key={x.id} value={x.id} disabled>
                      {x.name} (تحتاج ربط)
                    </option>
                  ))}
                </select>
              </Field>
              <fieldset className="sm:col-span-2 grid sm:grid-cols-2 gap-4 rounded-lg border border-line p-4" data-testid="alostaz-fields">
                <legend className="px-1 text-sm font-semibold">الأستاذ alostaz.io</legend>
                <p className="sm:col-span-2 text-xs text-muted">
                  من لوحة الأستاذ: الإعدادات ← تكامل API (API Integration) ← أنشئ عميل API جديد. يعطيك «رابط API» و«Bearer token»؛ انسخهم هنا واحفظ، ثم اضغط «اختبار الاتصال»
                  ونجهّز لك الضريبة والمستودع ومنتج «خدمة نقل» تلقائيًا.
                </p>
                <Field label="رابط API (API Base URL)">
                  <input name="alostaz_base_url" maxLength={300} defaultValue={values.alostaz_base_url ?? ""} placeholder="https://…" className="field text-start" dir="ltr" />
                </Field>
                <Field label="التوكن (Bearer token)" hint={values.alostaz_token ? `المحفوظ: ${maskKey(values.alostaz_token)} (اتركه فاضي لإبقائه)` : "يطلع مرة وحدة لما تنشئ عميل API"}>
                  <input name="alostaz_token" type="password" autoComplete="off" maxLength={2000} className="field" dir="ltr" />
                </Field>
                <Field label="رقم الفرع (Branch ID)" hint="غالبًا ١ إذا عندك فرع واحد">
                  <input name="alostaz_branch_id" maxLength={9} defaultValue={values.alostaz_branch_id ?? "1"} className="field text-start" dir="ltr" />
                </Field>
                <div className="text-xs text-muted self-end" data-testid="alostaz-ready">
                  {values.alostaz_product_id && values.alostaz_storehouse_id
                    ? `جاهز: المنتج #${values.alostaz_product_id} · المستودع #${values.alostaz_storehouse_id} · الضريبة ${values.alostaz_tax_id ? `#${values.alostaz_tax_id}` : "بدون"}`
                    : "لم يتجهّز بعد: احفظ ثم اضغط «اختبار الاتصال»"}
                </div>
              </fieldset>
              <fieldset className="sm:col-span-2 grid sm:grid-cols-2 gap-4 rounded-lg border border-line p-4">
                <legend className="px-1 text-sm font-semibold">وافق Wafeq</legend>
              <Field label="مفتاح API" hint={values.wafeq_api_key ? `المحفوظ: ${maskKey(values.wafeq_api_key)} (اتركه فاضي لإبقائه)` : "من وافق: الإعدادات ← API Keys"}>
                <input name="wafeq_api_key" type="password" autoComplete="off" maxLength={200} className="field" dir="ltr" />
              </Field>
              <Field label="حساب المبيعات (الإيرادات) في وافق" hint="مثل acc_… — اضغط «اختبار الاتصال» يعرض لك الحسابات">
                <input name="wafeq_account" maxLength={100} defaultValue={values.wafeq_account ?? ""} className="field" dir="ltr" />
              </Field>
              <Field label="معرّف ضريبة ١٥٪ في وافق (اختياري)" hint="مثل tax_… — بدونه تنرسل الفاتورة بدون ضريبة على البند">
                <input name="wafeq_tax_rate" maxLength={100} defaultValue={values.wafeq_tax_rate ?? ""} className="field" dir="ltr" />
              </Field>
              </fieldset>
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
              <input name={f.key} type={f.secret ? "password" : "text"} autoComplete="off" defaultValue={f.secret ? "" : (values[f.key] ?? "")} maxLength={f.max ?? 300} dir="ltr" className="field text-start" />
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
