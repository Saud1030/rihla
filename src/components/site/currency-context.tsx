"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type Currency = "SAR" | "USD";

type CurrencyCtx = {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  /** SAR → USD rate (how many USD per 1 SAR). 0 = USD disabled */
  usdRate: number;
};

const Ctx = createContext<CurrencyCtx>({ currency: "SAR", setCurrency: () => {}, usdRate: 0 });

export function useCurrency() {
  return useContext(Ctx);
}

const STORAGE_KEY = "rihla_currency";

export function CurrencyProvider({ usdRate, children }: { usdRate: number; children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>("SAR");

  // hydrate from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "USD" && usdRate > 0) setCurrencyState("USD");
    } catch {}
  }, [usdRate]);

  function setCurrency(c: Currency) {
    setCurrencyState(c);
    try {
      localStorage.setItem(STORAGE_KEY, c);
    } catch {}
  }

  // if admin disabled USD, force back to SAR
  const effective: Currency = usdRate > 0 ? currency : "SAR";

  return <Ctx value={{ currency: effective, setCurrency, usdRate }}>{children}</Ctx>;
}
