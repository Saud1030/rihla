"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { visibleLinks, type NavUser } from "@/lib/admin-links";

export function AdminNav({ user }: { user: NavUser }) {
  return <NavList pathname={usePathname() ?? ""} user={user} />;
}

/** Rendered while the current path is unknown (e.g. during prerender of dynamic admin pages). */
export function NavList({ pathname, user }: { pathname: string; user: NavUser }) {
  return (
    <nav className="flex md:flex-col overflow-x-auto md:overflow-visible px-2 py-2 gap-0.5" aria-label="لوحة التحكم">
      {visibleLinks(user).map((l) => {
        const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-md px-3 py-2 text-[15px] ${
              active ? "bg-white text-sign-deep font-medium" : "text-white/80 hover:bg-white/10 hover:text-white"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
