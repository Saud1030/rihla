"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-renders the page's server data every few seconds while the tab is visible (new chat messages) */
export function AutoRefresh({ every = 5000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, every);
    return () => clearInterval(id);
  }, [router, every]);
  return null;
}
