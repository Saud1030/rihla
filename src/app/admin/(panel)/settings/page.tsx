import { Suspense } from "react";
import { requireSection } from "@/lib/auth";
import { getSettings } from "@/lib/catalog";
import {
  savePolicySettings, saveBankSettings,
  savePricingSettings,
  saveSettings,
} from "../../actions";
import { SETTING_KEYS, SETTING_LABELS } from "@/lib/settings-keys";
import { ActionForm } from "@/components/admin/action-form";
import { Card, Field, PageHeader, Skeleton } from "@/components/admin/ui";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="الإعدادات والضريبة" />
      <Suspense fallback={<Skeleton h="h-[600px]" />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requireSection("settings");
  const values = await getSettings();
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px] items-start">
      <div className="space-y-8 min-w-0">
        <Card className="p-6">
          <h2 className="font-semibold mb-1">ضريبة القيمة المضافة والتسعير</h2>
          <p className="text-sm text-muted mb-4">
            الأسعار التي تكتبها في لوحة التحكم دائمًا قبل الضريبة، والضريبة
            تُضاف عند الدفع وتظهر للعميل مفصّلة.
          </p>
          <ActionForm
            action={savePricingSettings}
            submitLabel="حفظ إعدادات الضريبة"
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <Field
                label="نسبة الضريبة (٪)"
                hint="١٥ في السعودية. اكتب ٠ لإيقاف الضريبة"
              >
                <input
                  name="vat_rate"
                  inputMode="decimal"
                  required
                  defaultValue={values.vat_rate ?? "15"}
                  className="field tabular"
                  dir="ltr"
                />
              </Field>
              <Field
                label="الرقم الضريبي"
                hint="١٥ رقمًا، يظهر في صفحة الحجز وأسفل الموقع"
              >
                <input
                  name="vat_number"
                  inputMode="numeric"
                  maxLength={20}
                  defaultValue={values.vat_number ?? ""}
                  placeholder="3XXXXXXXXXXXXX3"
                  className="field tabular"
                  dir="ltr"
                />
              </Field>
              <label className="flex items-start gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  name="prices_include_vat"
                  defaultChecked={values.prices_include_vat === "1"}
                  className="size-4 mt-1 accent-sign"
                />
                <span>
                  عرض الأسعار شاملة الضريبة في صفحات الموقع
                  <span className="block text-xs text-muted">
                    عند إلغائها تظهر الأسعار قبل الضريبة مع ملاحظة «+ ضريبة
                    ١٥٪»، وتُضاف الضريبة في صفحة الدفع.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  name="distance_pricing"
                  defaultChecked={values.distance_pricing !== "0"}
                  className="size-4 mt-1 accent-sign"
                />
                <span>
                  السماح بالحجز بين أي وجهتين بالتسعير حسب المسافة
                  <span className="block text-xs text-muted">
                    أسعار الكيلومتر لكل سيارة تُضبط من صفحة السيارات. عند
                    الإيقاف يمكن حجز الرحلات الثابتة فقط.
                  </span>
                </span>
              </label>
            </div>
          </ActionForm>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold mb-1">الحجز بالساعة وسياسة الإلغاء</h2>
          <p className="text-sm text-muted mb-4">
            صفحة الشروط والأحكام تتحدّث تلقائيًا بهذه الأرقام.
          </p>
          <ActionForm action={savePolicySettings} submitLabel="حفظ السياسة">
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="flex items-start gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  name="hourly_enabled"
                  defaultChecked={values.hourly_enabled !== "0"}
                  className="size-4 mt-1 accent-sign"
                />
                <span>
                  تفعيل الحجز بالساعة (١٠ / ١٢ / ٢٤ ساعة)
                  <span className="block text-xs text-muted">
                    أسعار الباقات لكل سيارة تُضبط من صفحة السيارات.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 sm:col-span-2">
                <input type="checkbox" name="multi_enabled" defaultChecked={values.multi_enabled !== "0"} className="size-4 mt-1 accent-sign" />
                <span>
                  تفعيل الرحلات متعددة الوجهات (من ٢ إلى ٥ وجهات في حجز واحد)
                  <span className="block text-xs text-muted">السعر مجموع أسعار المراحل: السعر الثابت إن وُجد، وإلا حسب المسافة.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  name="cancel_enabled"
                  defaultChecked={values.cancel_enabled !== "0"}
                  className="size-4 mt-1 accent-sign"
                />
                <span>
                  السماح للعميل بإلغاء الحجز من الموقع بعد الدفع
                  <span className="block text-xs text-muted">
                    يؤكد العميل برقم جواله، ويُتاح الإلغاء حتى موعد الاستلام
                    فقط.
                  </span>
                </span>
              </label>
              <Field label="استرداد كامل إذا ألغى قبل الموعد بـ (ساعة)">
                <input
                  name="cancel_full_hours"
                  inputMode="numeric"
                  required
                  defaultValue={values.cancel_full_hours ?? "24"}
                  className="field tabular"
                  dir="ltr"
                />
              </Field>
              <Field
                label="نسبة الاسترداد بعد ذلك (٪)"
                hint="اكتب ٠ لعدم الاسترداد"
              >
                <input
                  name="cancel_partial_percent"
                  inputMode="numeric"
                  required
                  defaultValue={values.cancel_partial_percent ?? "50"}
                  className="field tabular"
                  dir="ltr"
                />
              </Field>
              <label className="flex items-start gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  name="refund_auto"
                  defaultChecked={values.refund_auto === "1"}
                  className="size-4 mt-1 accent-sign"
                />
                <span>
                  إرسال الاسترداد إلى ماي فاتورة تلقائيًا عند إلغاء العميل
                  <span className="block text-xs text-muted">
                    عند إيقافه يظهر الاسترداد في لوحة التحكم بانتظار موافقتك.
                  </span>
                </span>
              </label>
            </div>
          </ActionForm>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold mb-1">طرق الدفع</h2>
          <p className="text-sm text-muted mb-4">
            يرى العميل في صفحة الدفع خيارين: ماي فاتورة، والتحويل البنكي إذا فعّلته هنا. بعد وصول التحويل افتح الحجز واضغط «تأكيد استلام التحويل».
          </p>
          <ActionForm action={saveBankSettings} submitLabel="حفظ بيانات التحويل">
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="flex items-start gap-2 sm:col-span-2">
                <input type="checkbox" name="bank_enabled" defaultChecked={values.bank_enabled === "1"} className="size-4 mt-1 accent-sign" />
                <span>تفعيل الدفع بالتحويل البنكي</span>
              </label>
              <Field label="اسم البنك">
                <input name="bank_name" maxLength={100} defaultValue={values.bank_name ?? ""} className="field" />
              </Field>
              <Field label="اسم صاحب الحساب">
                <input name="bank_account_name" maxLength={150} defaultValue={values.bank_account_name ?? ""} className="field" />
              </Field>
              <Field label="رقم الآيبان (IBAN)" hint="مثل SA0380000000608010167519">
                <input name="bank_iban" maxLength={40} defaultValue={values.bank_iban ?? ""} className="field tabular" dir="ltr" />
              </Field>
            </div>
          </ActionForm>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold mb-4">بيانات التواصل والتنبيهات</h2>
          <ActionForm action={saveSettings} submitLabel="حفظ الإعدادات">
            <div className="grid sm:grid-cols-2 gap-4">
              {SETTING_KEYS.map((k) => {
                const meta = SETTING_LABELS[k];
                const long = k.startsWith("notice") || k.startsWith("address");
                return (
                  <Field
                    key={k}
                    label={meta.label}
                    hint={meta.hint}
                    className={long ? "sm:col-span-2" : ""}
                  >
                    <input
                      name={k}
                      defaultValue={values[k] ?? ""}
                      dir={meta.ltr ? "ltr" : undefined}
                      className="field text-start"
                    />
                  </Field>
                );
              })}
            </div>
          </ActionForm>
        </Card>
      </div>

    </div>
  );
}
