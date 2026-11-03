"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgePercent,
  CalendarCheck,
  ChartColumn,
  IdCard,
  Moon,
  Car,
  Clock,
  Image as ImageIcon,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  MessagesSquare,
  Navigation,
  Palette,
  Route,
  Settings,
  Star,
  Tags,
  TicketPercent,
  UserCircle,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { visibleLinks, type NavUser } from "@/lib/admin-links";

/** one icon per menu item (the label shows beside it, or as a tooltip when the menu is narrow) */
const ICONS: Record<string, LucideIcon> = {
  "/admin": LayoutDashboard,
  "/admin/my-trips": Navigation,
  "/admin/bookings": CalendarCheck,
  "/admin/revenue": ChartColumn,
  "/admin/drivers": Users,
  "/admin/driver-team": IdCard,
  "/admin/ratings": Star,
  "/admin/promos": TicketPercent,
  "/admin/messages": MessageSquare,
  "/admin/chat": MessagesSquare,
  "/admin/prices": Tags,
  "/admin/seasons": Moon,
  "/admin/offers": BadgePercent,
  "/admin/hourly-prices": Clock,
  "/admin/routes": Route,
  "/admin/destinations": MapPin,
  "/admin/vehicles": Car,
  "/admin/appearance": Palette,
  "/admin/banners": ImageIcon,
  "/admin/settings": Settings,
  "/admin/users": UserCog,
  "/admin/account": UserCircle,
};

export function AdminNav({ user }: { user: NavUser }) {
  return <NavList pathname={usePathname() ?? ""} user={user} />;
}

/** Rendered while the current path is unknown (e.g. during prerender of dynamic admin pages). */
export function NavList({ pathname, user }: { pathname: string; user: NavUser }) {
  return (
    <nav className="admin-nav flex md:flex-col overflow-x-auto md:overflow-visible px-2 py-2 gap-0.5" aria-label="لوحة التحكم">
      {visibleLinks(user).map((l) => {
        const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
        const Icon = ICONS[l.href] ?? LayoutDashboard;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            data-tip={l.label}
            className={`nav-link group relative flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-[15px] transition-colors duration-200 ${
              active ? "bg-white text-sign-deep font-medium" : "text-white/80 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon className="size-[18px] shrink-0" aria-hidden strokeWidth={1.8} />
            <span className="nav-label">{l.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
