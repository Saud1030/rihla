/** "150", "150.5", "١٥٠" -> halalas; "" -> null (left empty); invalid -> undefined */
export function sarToHalalas(raw: FormDataEntryValue | null): number | null | undefined {
  const v = String(raw ?? "").trim().replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace("٫", ".");
  if (v === "") return null;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(v)) return undefined;
  return Math.round(Number(v) * 100);
}
