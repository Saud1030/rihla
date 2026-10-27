import { getSettings } from "@/lib/catalog";
import type { Locale } from "@/i18n/dictionaries";
import { WhatsAppIcon } from "@/components/icons";

export function waLink(number: string, text?: string) {
  const n = number.replace(/[^\d]/g, "");
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export async function WhatsAppFab({ lang }: { lang: Locale }) {
  const s = await getSettings();
  if (!s.whatsapp) return null;
  return (
    <a
      href={waLink(s.whatsapp)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={lang === "ar" ? "تواصل عبر واتساب" : "Chat on WhatsApp"}
      className="fixed bottom-5 end-5 z-40 grid place-items-center size-14 rounded-full bg-[#1f9d55] text-white shadow-lg hover:bg-[#178246]"
    >
      <WhatsAppIcon className="size-7" />
    </a>
  );
}
