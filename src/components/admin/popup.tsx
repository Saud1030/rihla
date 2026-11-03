"use client";

import { useEffect, useRef } from "react";

/**
 * A button that opens its content in a window over the page (driver data, money, suspend...),
 * so the list itself stays short. The content stays mounted, so forms keep their messages.
 */
export function Popup({
  label,
  title,
  children,
  testId,
  defaultOpen = false,
  buttonClassName = "btn btn-ghost border border-line !min-h-8 !py-0.5 text-sm",
  wide = false,
}: {
  label: React.ReactNode;
  title: string;
  children: React.ReactNode;
  testId?: string;
  defaultOpen?: boolean;
  buttonClassName?: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (defaultOpen && !ref.current?.open) ref.current?.showModal();
  }, [defaultOpen]);
  return (
    <>
      <button type="button" className={buttonClassName} onClick={() => ref.current?.showModal()} aria-haspopup="dialog">
        {label}
      </button>
      <dialog
        ref={ref}
        className={`admin-popup ${wide ? "max-w-5xl" : "max-w-3xl"}`}
        data-testid={testId}
        aria-label={title}
        // a click on the dimmed backdrop closes it
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button type="button" className="grid size-8 place-items-center rounded-md hover:bg-stone text-lg leading-none" onClick={() => ref.current?.close()} aria-label="إغلاق">
            ×
          </button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </dialog>
    </>
  );
}
