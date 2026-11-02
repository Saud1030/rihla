"use client";

import { useSyncExternalStore } from "react";
import { Moon, PanelRightClose, PanelRightOpen, Sun } from "lucide-react";

/**
 * The admin's look, remembered in this browser: glass (dark, default) or light, and a narrow (icons only) or wide menu.
 * Kept as attributes on <html> (set before the page paints by the small script in the layout), so there is no flash.
 */
type Key = "admin-theme" | "admin-menu";
const ATTR: Record<Key, string> = { "admin-theme": "data-admin-theme", "admin-menu": "data-admin-menu" };
const read = (k: Key) => document.documentElement.getAttribute(ATTR[k]) ?? "";
function write(k: Key, v: string) {
  document.documentElement.setAttribute(ATTR[k], v);
  try {
    localStorage.setItem(k, v);
  } catch {}
  window.dispatchEvent(new Event("admin-view"));
}
const subscribe = (cb: () => void) => {
  window.addEventListener("admin-view", cb);
  return () => window.removeEventListener("admin-view", cb);
};
const useView = (k: Key) => useSyncExternalStore(subscribe, () => read(k), () => "");


export function ThemeToggle() {
  const glass = useView("admin-theme") !== "light";
  return (
    <button
      type="button"
      onClick={() => write("admin-theme", glass ? "light" : "glass")}
      className="icon-btn"
      aria-label={glass ? "الوضع الفاتح" : "الوضع الزجاجي الداكن"}
      title={glass ? "الوضع الفاتح" : "الوضع الزجاجي الداكن"}
      data-testid="admin-theme-toggle"
    >
      {glass ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden />}
    </button>
  );
}

export function MenuToggle() {
  const wide = useView("admin-menu") === "wide";
  return (
    <button
      type="button"
      onClick={() => write("admin-menu", wide ? "narrow" : "wide")}
      className="icon-btn hidden md:grid"
      aria-label={wide ? "تصغير القائمة" : "إظهار أسماء القائمة"}
      title={wide ? "تصغير القائمة" : "إظهار أسماء القائمة"}
      aria-expanded={wide}
      data-testid="admin-menu-toggle"
    >
      {wide ? <PanelRightClose className="size-[18px]" aria-hidden /> : <PanelRightOpen className="size-[18px]" aria-hidden />}
    </button>
  );
}
