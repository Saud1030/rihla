"use client";

import { useState } from "react";

/** A payment to a driver: by bank transfer (the transfer receipt is required) or cash (nothing to upload) */
export function PayoutFields({ today }: { today?: string }) {
  const [method, setMethod] = useState<"transfer" | "cash">("transfer");
  return (
    <div className="grid gap-3 sm:grid-cols-2 items-end">
      <label className="block">
        <span className="block text-sm font-medium mb-1">المبلغ المدفوع (ر.س)</span>
        <input name="amount" inputMode="decimal" required dir="ltr" className="field text-start tabular" placeholder="500" />
      </label>
      <label className="block">
        <span className="block text-sm font-medium mb-1">طريقة الدفع</span>
        <select name="method" value={method} onChange={(e) => setMethod(e.target.value as "transfer" | "cash")} className="field">
          <option value="transfer">تحويل بنكي</option>
          <option value="cash">نقدًا (كاش)</option>
        </select>
      </label>
      <label className="block">
        <span className="block text-sm font-medium mb-1">تاريخ الدفع</span>
        <input name="paidOn" type="date" required defaultValue={today ?? new Date().toISOString().slice(0, 10)} className="field" />
      </label>
      <label className="block">
        <span className="block text-sm font-medium mb-1">ملاحظة (اختياري)</span>
        <input name="note" maxLength={200} className="field" placeholder="رقم العملية…" />
      </label>
      {method === "transfer" && (
        <label className="block sm:col-span-2">
          <span className="block text-sm font-medium mb-1">إيصال التحويل</span>
          <input type="file" name="receipt" accept="image/png,image/jpeg,image/webp,application/pdf" required className="field" />
          <span className="block text-xs text-muted mt-1">صورة أو PDF، حتى ٥ ميجابايت. يشوفه السائق في صفحته.</span>
        </label>
      )}
    </div>
  );
}
