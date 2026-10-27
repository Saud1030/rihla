/**
 * Mobile / WhatsApp numbers are stored as +<country><number>.
 * Saudi numbers may be typed as 05xxxxxxxx, 5xxxxxxxx, 9665xxxxxxxx or 009665xxxxxxxx; Arabic digits are fine.
 * Returns null when the number can't be a mobile number.
 */
export function normalizePhone(input: string): string | null {
  let v = String(input ?? "")
    .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
    .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
    .replace(/[\s\-().‎‏]/g, "");
  if (!/^\+?\d+$/.test(v)) return null;
  if (v.startsWith("00")) v = "+" + v.slice(2);
  if (/^05\d{8}$/.test(v)) return "+966" + v.slice(1);
  if (/^5\d{8}$/.test(v)) return "+966" + v;
  if (/^9665\d{8}$/.test(v)) return "+" + v;
  if (!v.startsWith("+")) return null;
  const digits = v.slice(1);
  if (digits.startsWith("966")) return /^9665\d{8}$/.test(digits) ? v : null; // Saudi: mobiles only
  return /^[1-9]\d{7,14}$/.test(digits) ? v : null;
}

/** Digits only, for wa.me links and the WhatsApp API */
export const waNumber = (phone: string) => phone.replace(/\D/g, "");
