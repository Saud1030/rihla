"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

/** Opens the live chat if it's on the page; otherwise it's a plain link to the contact page */
export function OpenChatButton({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const onClick = (e: MouseEvent) => {
    if (document.documentElement.dataset.chat !== "1") return;
    e.preventDefault();
    window.dispatchEvent(new Event("rihla:open-chat"));
  };
  return (
    <Link href={href} onClick={onClick} className={className} data-testid="footer-help-button">
      {children}
    </Link>
  );
}
