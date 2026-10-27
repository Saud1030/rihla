"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Locale } from "@/i18n/dictionaries";

export function LangSwitch({ lang, label }: { lang: Locale; label: string }) {
  const pathname = usePathname() ?? `/${lang}`;
  const search = useSearchParams();
  const other: Locale = lang === "ar" ? "en" : "ar";
  const rest = pathname.replace(/^\/(ar|en)(?=\/|$)/, "");
  const qs = search?.toString();
  return (
    <Link
      href={`/${other}${rest}${qs ? `?${qs}` : ""}`}
      hrefLang={other}
      lang={other}
      className="px-3 py-2 rounded-md text-[15px] text-muted hover:text-ink hover:bg-stone"
    >
      {label}
    </Link>
  );
}
