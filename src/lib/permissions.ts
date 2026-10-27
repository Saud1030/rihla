/** Sections of the admin panel a staff account can be given. Owners get all of them; drivers get none (only "my trips"). */
export const SECTIONS = [
  { key: "bookings", label: "الحجوزات وإسناد السائقين" },
  { key: "drivers", label: "السائقين" },
  { key: "ratings", label: "التقييمات" },
  { key: "messages", label: "رسائل واتساب والبريد" },
  { key: "chat", label: "المحادثات والبوت" },
  { key: "catalog", label: "الأسعار والرحلات والوجهات والسيارات" },
  { key: "appearance", label: "المظهر والخلفية والبنرات" },
  { key: "settings", label: "الإعدادات" },
] as const;

export type Section = (typeof SECTIONS)[number]["key"];
export type Role = "owner" | "staff" | "driver";

export const ROLE_LABELS: Record<Role, string> = { owner: "مدير (كل الصلاحيات)", staff: "موظف", driver: "سائق" };

export const isSection = (v: string): v is Section => SECTIONS.some((s) => s.key === v);

export function can(user: { role: Role; permissions: string[] } | null, section: Section | "users") {
  if (!user) return false;
  if (user.role === "owner") return true;
  if (section === "users" || user.role !== "staff") return false;
  return user.permissions.includes(section);
}

/** Which admin path needs which section (used for the menu and the first page after sign-in) */
export const PATH_SECTIONS: [prefix: string, section: Section | "users"][] = [
  ["/admin/bookings", "bookings"],
  ["/admin/drivers", "drivers"],
  ["/admin/ratings", "ratings"],
  ["/admin/messages", "messages"],
  ["/admin/chat", "chat"],
  ["/admin/prices", "catalog"],
  ["/admin/routes", "catalog"],
  ["/admin/destinations", "catalog"],
  ["/admin/vehicles", "catalog"],
  ["/admin/appearance", "appearance"],
  ["/admin/banners", "appearance"],
  ["/admin/settings", "settings"],
  ["/admin/users", "users"],
];
