/** Settings editable from the admin panel, with their Arabic labels. */
export const SETTING_KEYS = [
  "phone",
  "whatsapp",
  "email",
  "address_ar",
  "address_en",
  "cr_number",
  "notice_ar",
  "notice_en",
] as const;

export const SETTING_LABELS: Record<(typeof SETTING_KEYS)[number], { label: string; hint?: string; ltr?: boolean }> = {
  phone: { label: "رقم الهاتف", hint: "يظهر في الموقع ورابط الاتصال", ltr: true },
  whatsapp: { label: "رقم واتساب", hint: "مع رمز الدولة بدون + أو مسافات، مثل 966512345678", ltr: true },
  email: { label: "البريد الإلكتروني", ltr: true },
  address_ar: { label: "العنوان (عربي)" },
  address_en: { label: "العنوان (إنجليزي)", ltr: true },
  cr_number: { label: "رقم السجل التجاري", ltr: true },
  notice_ar: { label: "شريط التنبيه أعلى الموقع (عربي)", hint: "اتركه فارغًا لإخفاء الشريط" },
  notice_en: { label: "شريط التنبيه أعلى الموقع (إنجليزي)", ltr: true },
};
