"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Locale } from "@/i18n/dictionaries";

export function LangSwitch({ lang, label, short }: { lang: Locale; label: string; short?: string }) {
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
      aria-label={short ? label : undefined}
      className="px-2 sm:px-3 py-2 rounded-md text-[15px] text-muted hover:text-ink hover:bg-stone whitespace-nowrap"
    >
      {short ? (
        <>
          <span className="sm:hidden">{short}</span>
          <span className="hidden sm:inline">{label}</span>
        </>
      ) : (
        label
      )}
    </Link>
  );
}
