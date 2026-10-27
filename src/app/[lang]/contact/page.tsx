import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { getDictionary, type Dictionary, type Locale } from "@/i18n/dictionaries";
import { getSettings } from "@/lib/catalog";
import { WhatsAppIcon, PhoneIcon } from "@/components/icons";
import { ContactForm } from "@/components/site/contact-form";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLocale();
  return { title: getDictionary(lang).contact.title };
}

export default async function ContactPage() {
  const lang = await getLocale();
  const t = getDictionary(lang);
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl md:text-4xl font-semibold">{t.contact.title}</h1>
      <p className="mt-2 text-muted max-w-[60ch]">{t.contact.lead}</p>
      <Suspense fallback={<div className="mt-8 h-72 rounded-xl bg-paper border border-line" />}>
        <ContactContent lang={lang} t={t} />
      </Suspense>
    </div>
  );
}

async function ContactContent({ lang, t }: { lang: Locale; t: Dictionary }) {
  const s = await getSettings();
  const address = lang === "ar" ? s.address_ar : s.address_en;
  const wa = (s.whatsapp ?? "").replace(/[^\d]/g, "");
  const items = [
    wa && {
      key: "wa",
      label: t.contact.whatsapp,
      value: <bdo dir="ltr">+{wa}</bdo>,
      href: `https://wa.me/${wa}`,
      icon: <WhatsAppIcon className="size-5" />,
      external: true,
    },
    s.phone && { key: "phone", label: t.contact.phone, value: <bdo dir="ltr">{s.phone}</bdo>, href: `tel:${s.phone}`, icon: <PhoneIcon className="size-5" /> },
    s.email && { key: "email", label: t.contact.email, value: s.email, href: `mailto:${s.email}`, icon: <span aria-hidden="true" className="text-lg leading-none">@</span> },
    address && {
      key: "address",
      label: t.contact.address,
      value: address,
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
      icon: <span aria-hidden="true" className="text-lg leading-none">⌖</span>,
      external: true,
    },
  ].filter(Boolean) as { key: string; label: string; value: React.ReactNode; href: string; icon: React.ReactNode; external?: boolean }[];

  return (
    <div className="mt-8 grid gap-8 md:grid-cols-[1fr_1.2fr] items-start">
      <ul className="space-y-3">
        {items.map((x) => (
          <li key={x.key}>
            <a
              href={x.href}
              {...(x.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="flex items-center gap-4 bg-paper border border-line rounded-xl p-4 hover:border-sign"
            >
              <span className="grid place-items-center size-10 rounded-lg bg-sign-soft text-sign shrink-0">{x.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm text-muted">{x.label}</span>
                <span className="block font-medium break-words">{x.value}</span>
              </span>
            </a>
          </li>
        ))}
        <li className="bg-sign-soft border border-sign/15 rounded-xl p-4 text-[15px]">{t.contact.hours}</li>
      </ul>

      {wa ? (
        <section className="bg-paper border border-line rounded-xl p-5 md:p-6">
          <h2 className="text-xl font-semibold mb-4">{t.contact.formTitle}</h2>
          <ContactForm
            whatsapp={wa}
            labels={{
              name: t.contact.name,
              ref: t.contact.ref,
              message: t.contact.message,
              send: t.contact.send,
              hint: t.contact.hint,
              empty: t.contact.empty,
            }}
          />
        </section>
      ) : null}
    </div>
  );
}
