import "server-only";
import { getSettings, getVehicles } from "./catalog";
import { parseVatConfig, withVat } from "./pricing";
import { dueSummary, splitAmount } from "./packages";
import type { PackageRow } from "@/db/schema";
import type { Locale } from "@/i18n/dictionaries";

/** What the site shows for a package: name, lines, total with VAT and each payment */
export async function packageView(p: PackageRow, lang: Locale) {
  const [st, vehicles] = await Promise.all([getSettings(), getVehicles()]);
  const total = withVat(p.price, parseVatConfig(st).rateBp).total;
  const parts = splitAmount(total, p.installments);
  const vehicle = vehicles.find((v) => v.id === p.vehicleId) ?? null;
  const text = (ar: string, en: string) => (lang === "ar" ? ar : en || ar);
  return {
    id: p.id,
    name: text(p.nameAr, p.nameEn),
    lines: text(p.detailsAr, p.detailsEn)
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean),
    total,
    parts,
    /** e.g. "2 before the trip · 1 after it" (empty when all are before) */
    due: dueSummary(parts.length, p.afterTrip, lang),
    passengers: p.passengers,
    vehicle: vehicle ? { name: lang === "ar" ? vehicle.nameAr : vehicle.nameEn, image: vehicle.imageUrl ?? `/vehicles/${vehicle.category}.svg` } : null,
  };
}
