"use client";

import { RIYAL } from "@/lib/format";
import { useCurrency } from "./currency-context";

export function CurrencySwitch({ arLabel, enLabel }: { arLabel?: string; enLabel?: string }) {
  const { currency, setCurrency, usdRate } = useCurrency();

  // don't render if USD is disabled in admin
  if (usdRate <= 0) return null;

  const isSar = currency === "SAR";
  const label = isSar ? (enLabel ?? "USD") : (arLabel ?? "SAR");

  return (
    <button
      type="button"
      onClick={() => setCurrency(isSar ? "USD" : "SAR")}
      aria-label={label}
      className="inline-flex items-center gap-1 px-2 sm:px-3 py-2 rounded-md text-[15px] text-muted hover:text-ink hover:bg-stone whitespace-nowrap tabular"
    >
      <span className={isSar ? "font-semibold text-ink" : ""}>{RIYAL}</span>
      <span className="text-xs text-muted">/</span>
      <span className={!isSar ? "font-semibold text-ink" : ""}>$</span>
    </button>
  );
}
