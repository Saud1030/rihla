/** The 13 administrative regions of Saudi Arabia. Cities in the database point to one of these slugs. */
export const REGIONS = [
  { slug: "riyadh", ar: "منطقة الرياض", en: "Riyadh Region" },
  { slug: "makkah", ar: "منطقة مكة المكرمة", en: "Makkah Region" },
  { slug: "madinah", ar: "منطقة المدينة المنورة", en: "Madinah Region" },
  { slug: "qassim", ar: "منطقة القصيم", en: "Al-Qassim Region" },
  { slug: "eastern", ar: "المنطقة الشرقية", en: "Eastern Province" },
  { slug: "asir", ar: "منطقة عسير", en: "Asir Region" },
  { slug: "tabuk", ar: "منطقة تبوك", en: "Tabuk Region" },
  { slug: "hail", ar: "منطقة حائل", en: "Hail Region" },
  { slug: "northern-borders", ar: "منطقة الحدود الشمالية", en: "Northern Borders Region" },
  { slug: "jazan", ar: "منطقة جازان", en: "Jazan Region" },
  { slug: "najran", ar: "منطقة نجران", en: "Najran Region" },
  { slug: "baha", ar: "منطقة الباحة", en: "Al-Baha Region" },
  { slug: "jouf", ar: "منطقة الجوف", en: "Al-Jouf Region" },
] as const;

export type RegionSlug = (typeof REGIONS)[number]["slug"];

export function regionName(slug: string, lang: "ar" | "en") {
  return REGIONS.find((r) => r.slug === slug)?.[lang] ?? slug;
}

export const LOCATION_KINDS = ["airport", "station", "city", "hotels", "religious", "landmark", "other"] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export const KIND_LABELS: Record<LocationKind, { ar: string; en: string }> = {
  airport: { ar: "مطار", en: "Airport" },
  station: { ar: "محطة قطار", en: "Train station" },
  city: { ar: "داخل المدينة", en: "City" },
  hotels: { ar: "منطقة فنادق", en: "Hotels" },
  religious: { ar: "مسجد ومشعر", en: "Holy site" },
  landmark: { ar: "معلم سياحي", en: "Landmark" },
  other: { ar: "أخرى", en: "Other" },
};
