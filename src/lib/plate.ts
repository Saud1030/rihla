/** Saudi car plates and colours, shared by the driver forms (browser) and the server */

/** the 17 Arabic letters used on Saudi plates */
export const PLATE_LETTERS = ["ا", "ب", "ح", "د", "ر", "س", "ص", "ط", "ع", "ق", "ك", "ل", "م", "ن", "ه", "و", "ى"] as const;

/** ten basic car colours */
export const CAR_COLORS = [
  { ar: "أبيض", en: "White" },
  { ar: "أسود", en: "Black" },
  { ar: "فضي", en: "Silver" },
  { ar: "رمادي", en: "Grey" },
  { ar: "أحمر", en: "Red" },
  { ar: "أزرق", en: "Blue" },
  { ar: "بني", en: "Brown" },
  { ar: "بيج", en: "Beige" },
  { ar: "أخضر", en: "Green" },
  { ar: "ذهبي", en: "Gold" },
] as const;

export const isCarColor = (v: string) => CAR_COLORS.some((c) => c.ar === v);

const toLatinDigits = (v: string) => v.replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)));

/** three letters + up to four digits -> "ا ب ح 1234", or null when not a valid plate */
export function composePlate(letters: string[], digits: string) {
  const d = toLatinDigits(digits.trim());
  if (letters.length !== 3 || letters.some((l) => !(PLATE_LETTERS as readonly string[]).includes(l))) return null;
  if (!/^\d{1,4}$/.test(d)) return null;
  return `${letters.join(" ")} ${d}`;
}

/** read a stored plate back into its letters and digits (for editing); old free text keeps what it can */
export function splitPlate(plate: string | null | undefined): { letters: string[]; digits: string } {
  const p = toLatinDigits(plate ?? "");
  const letters = [...p.replace(/[^؀-ۿ]/g, "")].filter((c) => (PLATE_LETTERS as readonly string[]).includes(c)).slice(0, 3);
  return { letters, digits: (p.match(/\d{1,4}/) ?? [""])[0] };
}

/** the plate from a form: plateL1..plateL3 + plateDigits */
export function plateFromForm(formData: FormData) {
  return composePlate(
    [1, 2, 3].map((i) => String(formData.get(`plateL${i}`) ?? "")),
    String(formData.get("plateDigits") ?? ""),
  );
}
