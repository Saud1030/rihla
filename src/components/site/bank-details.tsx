"use client";

import { useState } from "react";

type Bank = { bankName: string; accountName: string; iban: string };
type Labels = { bank: string; account: string; iban: string; amount: string; note: string; copy: string; copied: string; refLabel: string };

/** Bank account to transfer to, with a copy button for the IBAN. */
export function BankDetails({ bank, amount, refCode, labels: L }: { bank: Bank; amount: string; refCode: string; labels: Labels }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(key);
        setTimeout(() => setCopied(null), 2000);
      },
      () => setCopied(null),
    );
  };
  const ibanGrouped = bank.iban.replace(/(.{4})/g, "$1 ").trim();
  const rows: [string, string, React.ReactNode, string?][] = [
    ["bank", L.bank, bank.bankName],
    ["account", L.account, bank.accountName],
    ["iban", L.iban, <bdo key="i" dir="ltr" className="tabular tracking-wide">{ibanGrouped}</bdo>, bank.iban],
    ["amount", L.amount, <span key="a" className="font-semibold tabular">{amount}</span>],
    ["ref", L.refLabel, <bdo key="r" dir="ltr" className="font-semibold tracking-wider">{refCode}</bdo>, refCode],
  ];
  return (
    <div>
      <dl className="divide-y divide-line border border-line rounded-lg text-[15px]">
        {rows.map(([key, label, value, copyText]) => (
          <div key={key} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <dt className="text-muted shrink-0">{label}</dt>
            <dd className="min-w-0 flex items-center gap-2 text-end">
              <span className="min-w-0 break-all">{value}</span>
              {copyText && (
                <button
                  type="button"
                  onClick={() => copy(key, copyText)}
                  className="shrink-0 rounded-md border border-line px-2 py-0.5 text-xs hover:border-sign"
                  aria-label={`${L.copy} ${label}`}
                >
                  {copied === key ? L.copied : L.copy}
                </button>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-muted">{L.note}</p>
    </div>
  );
}
