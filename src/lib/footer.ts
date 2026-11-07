/**
 * The footer the admin builds himself (Admin -> Appearance -> Footer):
 * a help strip on top, columns of items (links, texts, contacts, badges with a picture, sub-headings
 * with bullet lists such as branches by city) and a row of payment-method logos.
 * Stored as JSON in the `footer_blocks` setting; pictures live in `assets` under `footer:<id>`.
 */

export type Tr = { ar: string; en: string };

export type FooterItemKind = "link" | "text" | "contact" | "badge" | "heading" | "bullet";
export type ContactIcon = "phone" | "email" | "whatsapp" | "location" | "none";

export type FooterItem = {
  id: string;
  kind: FooterItemKind;
  /** the bold part: "Unified number:", "Riyadh", a link's text... */
  label: Tr;
  /** the value under / next to it: the number, the address... */
  value: Tr;
  /** for links and badges (optional) */
  url: string;
  icon: ContactIcon;
  /** version of the uploaded picture ("" = none) */
  img: string;
};

export type FooterColumn = { id: string; title: Tr; items: FooterItem[] };
export type PayItem = { id: string; name: string; on: boolean; img: string };

export type FooterConfig = {
  /** false = the simple footer (about, page links, contact) */
  custom: boolean;
  /** company name and its short about text as the first column */
  showAbout: boolean;
  help: { on: boolean; title: Tr; text: Tr; button: Tr };
  columns: FooterColumn[];
  payOn: boolean;
  pay: PayItem[];
};

export const MAX_COLUMNS = 6;
export const MAX_ITEMS = 30;
export const MAX_PAY = 16;

const tr = (ar = "", en = ""): Tr => ({ ar, en });
let n = 0;
export const newId = () => `${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function blankItem(kind: FooterItemKind = "text"): FooterItem {
  return { id: newId(), kind, label: tr(), value: tr(), url: "", icon: kind === "contact" ? "phone" : "none", img: "" };
}

/** the payment methods offered by default; the admin uploads each one's logo picture */
export const PAY_PRESETS = ["مدى mada", "Visa", "Mastercard", "Apple Pay", "STC Pay", "Tabby", "Tamara", "American Express", "تحويل بنكي", "نقدًا"];

/** a first version built from what's already in the settings, so the admin starts from something */
export function defaultFooter(st: Record<string, string | undefined>): FooterConfig {
  const item = (kind: FooterItemKind, label: Tr, value: Tr = tr(), extra: Partial<FooterItem> = {}): FooterItem => ({ ...blankItem(kind), label, value, ...extra });
  const info: FooterItem[] = [];
  if (st.address_ar || st.address_en) info.push(item("text", tr("العنوان الوطني:", "National address:"), tr(st.address_ar ?? "", st.address_en ?? "")));
  info.push(item("text", tr("رقم السجل التجاري:", "Commercial registration:"), tr(st.cr_number ?? "", st.cr_number ?? "")));
  info.push(item("badge", tr("رقم التسجيل الضريبي:", "VAT number:"), tr(st.vat_number ?? "", st.vat_number ?? "")));
  const contact: FooterItem[] = [];
  if (st.phone) contact.push(item("contact", tr("الرقم الموحد للاتصال:", "Call us:"), tr(st.phone, st.phone), { icon: "phone" }));
  if (st.email) contact.push(item("contact", tr("البريد الإلكتروني:", "Email:"), tr(st.email, st.email), { icon: "email" }));
  return {
    custom: false,
    showAbout: true,
    help: {
      on: true,
      title: tr("تحتاج مساعدة؟ كلّمنا في المحادثة المباشرة", "Need help? Talk to us in live chat"),
      text: tr("رد فوري بخصوص حجزك أو أي سؤال، ونحوّلك لخدمة العملاء إذا احتجت.", "Quick answers about your booking or anything else, and a person from our team when you need one."),
      button: tr("ابدأ المحادثة", "Start a chat"),
    },
    columns: [
      { id: newId(), title: tr("معلومات عنا", "About us"), items: info },
      {
        id: newId(),
        title: tr("روابط مفيدة", "Useful links"),
        items: [
          item("link", tr("تتبع حجزك", "Track your booking"), tr(), { url: "/booking" }),
          item("link", tr("الرحلات والأسعار", "Routes & prices"), tr(), { url: "/routes" }),
          item("link", tr("السيارات", "Vehicles"), tr(), { url: "/fleet" }),
          item("link", tr("تواصل معنا", "Contact us"), tr(), { url: "/contact" }),
          item("link", tr("الشروط والأحكام", "Terms"), tr(), { url: "/terms" }),
          item("link", tr("انضم كسائق", "Drive with us"), tr(), { url: "/drivers/join" }),
        ],
      },
      { id: newId(), title: tr("الشكاوى والمقترحات", "Complaints & suggestions"), items: contact },
    ],
    payOn: true,
    // Tabby, Tamara and Amex start hidden: the site doesn't take them unless the gateway does
    pay: PAY_PRESETS.map((name) => ({ id: newId(), name, on: !["Tabby", "Tamara", "American Express"].includes(name), img: "" })),
  };
}

/* ---------- reading what's stored, defensively ---------- */

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const trOf = (v: unknown, max: number): Tr => {
  const o = (v ?? {}) as Record<string, unknown>;
  return { ar: str(o.ar, max), en: str(o.en, max) };
};
const KINDS: FooterItemKind[] = ["link", "text", "contact", "badge", "heading", "bullet"];
const ICONS: ContactIcon[] = ["phone", "email", "whatsapp", "location", "none"];
const idOf = (v: unknown) => (typeof v === "string" && /^[a-z0-9]{4,40}$/.test(v) ? v : newId());

/** a site link ("/routes"), a full https link, tel:, mailto: or wa.me; anything else is dropped */
export function cleanUrl(v: unknown): string {
  const u = str(v, 500);
  if (!u) return "";
  if (/^\/(?!\/)[^\s]*$/.test(u)) return u;
  if (/^(https?:\/\/|mailto:|tel:)[^\s<>"']+$/i.test(u)) return u;
  return "";
}

export function parseFooter(json: string | undefined, st: Record<string, string | undefined>): FooterConfig {
  if (!json) return defaultFooter(st);
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(json);
    if (!raw || typeof raw !== "object") return defaultFooter(st);
  } catch {
    return defaultFooter(st);
  }
  const help = (raw.help ?? {}) as Record<string, unknown>;
  const columns = (Array.isArray(raw.columns) ? raw.columns : []).slice(0, MAX_COLUMNS).map((c: Record<string, unknown>) => ({
    id: idOf(c?.id),
    title: trOf(c?.title, 80),
    items: (Array.isArray(c?.items) ? c.items : []).slice(0, MAX_ITEMS).map((i: Record<string, unknown>) => {
      const kind = KINDS.includes(i?.kind as FooterItemKind) ? (i.kind as FooterItemKind) : "text";
      return {
        id: idOf(i?.id),
        kind,
        label: trOf(i?.label, 150),
        value: trOf(i?.value, 300),
        url: cleanUrl(i?.url),
        icon: ICONS.includes(i?.icon as ContactIcon) ? (i.icon as ContactIcon) : "none",
        img: str(i?.img, 20),
      };
    }),
  }));
  const pay = (Array.isArray(raw.pay) ? raw.pay : []).slice(0, MAX_PAY).map((p: Record<string, unknown>) => ({
    id: idOf(p?.id),
    name: str(p?.name, 40),
    on: p?.on !== false,
    img: str(p?.img, 20),
  }));
  return {
    custom: raw.custom === true,
    showAbout: raw.showAbout !== false,
    help: { on: help.on === true, title: trOf(help.title, 120), text: trOf(help.text, 300), button: trOf(help.button, 40) },
    columns,
    payOn: raw.payOn !== false,
    pay,
  };
}

/** the text in the visitor's language, falling back to the other one */
export const pick = (t: Tr, lang: "ar" | "en") => (lang === "ar" ? t.ar || t.en : t.en || t.ar);

/** what a contact value links to */
export function contactHref(icon: ContactIcon, value: string, url: string): string | null {
  if (url) return url;
  const v = value.trim();
  if (!v) return null;
  if (icon === "phone") return `tel:${v.replace(/[^\d+]/g, "")}`;
  if (icon === "email" && v.includes("@")) return `mailto:${v}`;
  if (icon === "whatsapp") return `https://wa.me/${v.replace(/\D/g, "")}`;
  return null;
}

export const footerImg = (id: string, v: string) => `/api/brand/footer/${id}?v=${v}`;
