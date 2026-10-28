/** Shared by the driver application form (browser) and the server */

/** every photo a driver uploads must be under this size */
export const DRIVER_PHOTO_MAX = 1024 * 1024; // 1 MB

export const DOC_KINDS = ["id_card", "registration", "car_inside", "car_outside"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const DOC_LABELS: Record<DocKind | "photo", { ar: string; en: string }> = {
  photo: { ar: "صورتك الشخصية", en: "Your photo" },
  id_card: { ar: "صورة الهوية أو الإقامة", en: "ID card or iqama" },
  registration: { ar: "صورة استمارة السيارة", en: "Car registration (istimara)" },
  car_inside: { ar: "صورة السيارة من الداخل", en: "Car interior" },
  car_outside: { ar: "صورة السيارة من الخارج", en: "Car exterior" },
};

/** Model years offered: next year back to 2005 */
export function modelYears(now = new Date()) {
  const y = now.getFullYear() + 1;
  return Array.from({ length: y - 2005 + 1 }, (_, i) => String(y - i));
}
