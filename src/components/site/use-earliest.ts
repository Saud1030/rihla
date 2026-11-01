"use client";

import { useSyncExternalStore } from "react";
import { earliestPickup, type Earliest } from "@/lib/lead-time";

/** the current minute; changes once a minute so the earliest time moves on while the page is open */
const minute = () => Math.floor(Date.now() / 60_000);
function subscribe(cb: () => void) {
  const id = setInterval(cb, 15_000);
  return () => clearInterval(id);
}

/** The earliest pickup that can be booked, in the browser (null while the page is drawn on the server). */
export function useEarliest(leadHours: number): Earliest | null {
  const m = useSyncExternalStore(subscribe, minute, () => null);
  // the next minute, so the browser never offers a time the server would refuse
  return m == null ? null : earliestPickup(leadHours, (m + 1) * 60_000);
}
