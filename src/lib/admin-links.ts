import { can, PATH_SECTIONS, type Role } from "./permissions";

/** The admin menu (shared by the client-side menu and server pages) */
export const LINKS = [
  { href: "/admin", label: "الرئيسية", exact: true },
  { href: "/admin/my-trips", label: "رحلاتي", driverOnly: true },
  { href: "/admin/bookings", label: "الحجوزات" },
  { href: "/admin/drivers", label: "السائقين" },
  { href: "/admin/ratings", label: "التقييمات" },
  { href: "/admin/messages", label: "رسائل واتساب والبريد" },
  { href: "/admin/chat", label: "المحادثات والبوت" },
  { href: "/admin/prices", label: "الأسعار" },
  { href: "/admin/routes", label: "الرحلات الثابتة" },
  { href: "/admin/destinations", label: "الوجهات والمدن" },
  { href: "/admin/vehicles", label: "السيارات" },
  { href: "/admin/appearance", label: "المظهر والشعار" },
  { href: "/admin/banners", label: "الخلفية والبنرات" },
  { href: "/admin/settings", label: "الإعدادات والضريبة" },
  { href: "/admin/users", label: "المستخدمين والصلاحيات" },
  { href: "/admin/account", label: "حسابي" },
];

export type NavUser = { role: Role; permissions: string[] } | null;

/** Only the sections this account may open */
export function visibleLinks(user: NavUser) {
  return LINKS.filter((l) => {
    if (!user) return l.href === "/admin";
    if (l.href === "/admin/account") return true;
    if (user.role === "driver") return !!l.driverOnly;
    if (l.driverOnly) return false;
    if (l.href === "/admin") return true;
    const rule = PATH_SECTIONS.find(([p]) => l.href.startsWith(p));
    return rule ? can(user, rule[1]) : false;
  });
}

