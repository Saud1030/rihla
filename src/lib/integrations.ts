import "server-only";

/**
 * Payment gateways and e-invoicing platforms (Admin -> Payment gateways & invoicing).
 * Each one's keys are saved in the panel; only the ones marked ready are connected in the code today.
 * The others keep their keys until they are connected (a small code change each).
 */

export type IntegrationField = { key: string; label: string; secret?: boolean; hint?: string; options?: [value: string, label: string][]; max?: number };
export type Integration = { id: string; name: string; site: string; ready: boolean; fields: IntegrationField[] };

export const GATEWAYS: Integration[] = [
  {
    id: "edfapay",
    name: "إدفع باي EdfaPay",
    site: "https://edfapay.com",
    ready: true,
    fields: [
      { key: "gw_edfapay_mode", label: "البيئة", options: [["live", "فعلي (Production)"], ["test", "تجريبي (Sandbox)"]] },
      { key: "gw_edfapay_key", label: "API Key (X-API-KEY)", secret: true, hint: "من لوحة EdfaPay. يُستعمل من السيرفر فقط." },
      { key: "gw_edfapay_secret", label: "Webhook Secret", secret: true, hint: "لازم تحطه هنا وفي لوحة EdfaPay (Webhook) مع الرابط: https://موقعك/api/payments/edfapay. بدونه ما ينقبل أي دفع." },
    ],
  },
  { id: "moyasar", name: "ميسر Moyasar", site: "https://moyasar.com", ready: false, fields: [{ key: "gw_moyasar_public", label: "Publishable Key" }, { key: "gw_moyasar_secret", label: "Secret Key", secret: true }] },
  { id: "tap", name: "تاب Tap Payments", site: "https://tap.company", ready: false, fields: [{ key: "gw_tap_public", label: "Public Key" }, { key: "gw_tap_secret", label: "Secret Key", secret: true }] },
  { id: "hyperpay", name: "هايبر باي HyperPay", site: "https://hyperpay.com", ready: false, fields: [{ key: "gw_hyperpay_entity", label: "Entity ID" }, { key: "gw_hyperpay_token", label: "Access Token", secret: true }] },
  { id: "paytabs", name: "باي تابز PayTabs", site: "https://paytabs.com", ready: false, fields: [{ key: "gw_paytabs_profile", label: "Profile ID" }, { key: "gw_paytabs_key", label: "Server Key", secret: true }] },
  { id: "geidea", name: "جيديا Geidea", site: "https://geidea.net", ready: false, fields: [{ key: "gw_geidea_public", label: "Public Key" }, { key: "gw_geidea_password", label: "API Password", secret: true }] },
];

/** e-invoicing: Wafeq is connected (its own fields live in einvoice.ts); the others keep keys for later */
export const EINVOICE_PLATFORMS: Integration[] = [
  { id: "wafeq", name: "وافق Wafeq", site: "https://wafeq.com", ready: true, fields: [] },
  { id: "qoyod", name: "قيود Qoyod", site: "https://qoyod.com", ready: false, fields: [{ key: "einv_qoyod_key", label: "API Key", secret: true }] },
  { id: "zoho", name: "زوهو بوكس Zoho Books", site: "https://www.zoho.com/sa/books/", ready: false, fields: [{ key: "einv_zoho_org", label: "Organization ID" }, { key: "einv_zoho_token", label: "OAuth Token", secret: true }] },
  { id: "daftra", name: "دفترة Daftra", site: "https://daftra.com", ready: false, fields: [{ key: "einv_daftra_domain", label: "رابط الحساب (subdomain)" }, { key: "einv_daftra_key", label: "API Key", secret: true }] },
];

/** WhatsApp Business Cloud API (Meta): the company's own number sends the booking messages */
export const WHATSAPP: Integration = {
  id: "whatsapp",
  name: "واتساب للأعمال WhatsApp Cloud API",
  site: "https://developers.facebook.com/apps",
  ready: true,
  fields: [
    { key: "wa_phone_id", label: "Phone Number ID", hint: "من Meta: تطبيقك ← WhatsApp ← API Setup (رقم طويل، مو رقم الجوال)" },
    { key: "wa_token", label: "Access Token (دائم)", secret: true, hint: "من Business Settings ← System users ← Generate token (صلاحية whatsapp_business_messaging)" },
    { key: "wa_waba_id", label: "WhatsApp Business Account ID", hint: "من Meta: WhatsApp ← API Setup. يحدد لـ Meta أي حساب تنرسل منه الرسائل" },
  ],
};

export const allIntegrationKeys = () => [...GATEWAYS, ...EINVOICE_PLATFORMS, WHATSAPP].flatMap((g) => g.fields);
