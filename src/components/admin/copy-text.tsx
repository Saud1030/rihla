"use client";

import { useState } from "react";

/** A button that copies a text (a promo code, a ready message) */
export function CopyText({ text, label, done = "تم النسخ ✓", className = "btn btn-ghost border border-line !min-h-9 !py-1 text-sm", testId }: { text: string; label: string; done?: string; className?: string; testId?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className={className}
      data-testid={testId}
      onClick={() =>
        navigator.clipboard?.writeText(text).then(
          () => {
            setOk(true);
            setTimeout(() => setOk(false), 2000);
          },
          () => setOk(false),
        )
      }
    >
      <span aria-live="polite">{ok ? done : label}</span>
    </button>
  );
}
