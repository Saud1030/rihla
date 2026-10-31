/** Shared by the driver application form (browser) and the server */

/** every photo a driver uploads must be under this size */
export const DRIVER_PHOTO_MAX = 1024 * 1024; // 1 MB

export const DOC_KINDS = ["id_card", "license", "registration", "car_inside", "car_outside"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const DOC_LABELS: Record<DocKind | "photo", { ar: string; en: string }> = {
  photo: { ar: "صورتك الشخصية", en: "Your photo" },
  id_card: { ar: "صورة الهوية أو الإقامة", en: "ID card or iqama" },
  license: { ar: "صورة رخصة القيادة", en: "Driving licence" },
  registration: { ar: "صورة استمارة السيارة", en: "Car registration (istimara)" },
  car_inside: { ar: "صورة السيارة من الداخل", en: "Car interior" },
  car_outside: { ar: "صورة السيارة من الخارج", en: "Car exterior" },
};

/** Model years offered: next year back to 2005 */
export function modelYears(now = new Date()) {
  const y = now.getFullYear() + 1;
  return Array.from({ length: y - 2005 + 1 }, (_, i) => String(y - i));
}

/**
 * Saudi driving licence and car registration are 9.56 x 6.4 cm cards. Their photos are cropped in the
 * browser to exactly that shape and saved at 300 dpi (1129 x 756 px), so every one looks the same.
 */
export const CARD_DOCS: readonly string[] = ["license", "registration"];
export const CARD_CM = { w: 9.56, h: 6.4 } as const;
export const CARD_PX = { w: Math.round((CARD_CM.w / 2.54) * 300), h: Math.round((CARD_CM.h / 2.54) * 300) } as const;
/** a phone photo of a card may be big; it is cropped and made small before sending */
export const CARD_SOURCE_MAX = 25 * 1024 * 1024;
