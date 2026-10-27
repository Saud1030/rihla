/**
 * Pricing rules shared by the site, the booking action and the admin panel.
 * All money is in halalas (1 SAR = 100 halalas).
 */

/** Roads are longer than a straight line; 1.25 matches Saudi intercity roads well */
export const ROAD_FACTOR = 1.25;

type Point = { lat: number | null; lng: number | null };

export function straightKm(a: Point, b: Point) {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Estimated road distance in km (at least 3 km), or null if a place has no coordinates */
export function roadKm(a: Point, b: Point) {
  const d = straightKm(a, b);
  return d == null ? null : Math.max(3, Math.round(d * ROAD_FACTOR));
}

/** Estimated drive time in minutes: slower in town, ~85 km/h between cities */
export function driveMinutes(km: number) {
  return Math.round(km < 40 ? 10 + km * 1.6 : 20 + km * 0.7);
}

export type DistanceRates = { baseFare: number; perKm: number; minFare: number };

/** Price before VAT for a vehicle over a distance, rounded up to the nearest 5 SAR */
export function distancePrice(v: DistanceRates, km: number) {
  const raw = Math.max(v.minFare, v.baseFare + v.perKm * km);
  return Math.ceil(raw / 500) * 500;
}

/* ---------------- VAT ---------------- */

export type VatConfig = {
  /** basis points: 1500 = 15% */
  rateBp: number;
  /** show prices VAT-inclusive on listings (checkout always shows the breakdown) */
  inclusiveDisplay: boolean;
  number: string;
};

export function vatAmount(subtotal: number, rateBp: number) {
  return Math.round((subtotal * rateBp) / 10000);
}

export function withVat(subtotal: number, rateBp: number) {
  const vat = vatAmount(subtotal, rateBp);
  return { subtotal, vat, total: subtotal + vat };
}

/** The number to show on listings for a pre-VAT price */
export function displayPrice(subtotal: number, vat: VatConfig) {
  return vat.inclusiveDisplay ? subtotal + vatAmount(subtotal, vat.rateBp) : subtotal;
}

export function parseVatConfig(settings: Record<string, string>): VatConfig {
  const pct = Number(settings.vat_rate ?? "15");
  return {
    rateBp: Number.isFinite(pct) && pct >= 0 && pct <= 100 ? Math.round(pct * 100) : 1500,
    inclusiveDisplay: settings.prices_include_vat === "1",
    number: settings.vat_number ?? "",
  };
}
