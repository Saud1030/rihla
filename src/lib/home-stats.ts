/** The numbers strip on the home page (Admin -> Appearance): up to four numbers with a label each */
export type HomeStat = { value: number; ar: string; en: string };
export const STAT_SLOTS = 4;

export const DEFAULT_STATS: HomeStat[] = [
  { value: 112, ar: "سيارة مجهزة", en: "Cars ready" },
  { value: 230, ar: "سائق تحت الطلب", en: "Drivers on call" },
  { value: 2412, ar: "عميل تم خدمتهم", en: "Customers served" },
  { value: 24, ar: "ساعة عمل", en: "Hours a day" },
];

export function parseStats(json: string | undefined): HomeStat[] {
  if (!json) return DEFAULT_STATS;
  try {
    const raw = JSON.parse(json);
    if (!Array.isArray(raw)) return DEFAULT_STATS;
    return raw.slice(0, STAT_SLOTS).map((x) => ({
      value: Math.max(0, Math.min(999_999_999, Math.round(Number(x?.value) || 0))),
      ar: typeof x?.ar === "string" ? x.ar.trim().slice(0, 40) : "",
      en: typeof x?.en === "string" ? x.en.trim().slice(0, 40) : "",
    }));
  } catch {
    return DEFAULT_STATS;
  }
}
