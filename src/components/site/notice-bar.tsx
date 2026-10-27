import { getSettings } from "@/lib/catalog";
import type { Locale } from "@/i18n/dictionaries";

export async function NoticeBar({ lang }: { lang: Locale }) {
  const s = await getSettings();
  const text = lang === "ar" ? s.notice_ar : s.notice_en;
  if (!text) return null;
  return (
    <div className="bg-amber text-ink text-center text-sm px-4 py-1.5 font-medium" role="note">
      {text}
    </div>
  );
}
