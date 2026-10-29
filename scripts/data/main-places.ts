/**
 * The company's own catalog: seven cities and their destinations, with fixed routes and sample prices.
 * Used by `npm run db:seed` (unless SEED_CATALOG=full, which loads every Saudi city for the tests),
 * and applied to an existing database once by scripts/apply-catalog.ts.
 * Slugs that already existed are kept, so old bookings and links still match.
 */
import type { SeedCity, SeedPlace } from "./saudi-places";

export const MAIN_CITIES: SeedCity[] = [
  { slug: "makkah", ar: "مكة المكرمة", en: "Makkah", region: "makkah", lat: 21.4225, lng: 39.8262 },
  { slug: "madinah", ar: "المدينة المنورة", en: "Madinah", region: "madinah", lat: 24.4672, lng: 39.6111 },
  { slug: "jeddah", ar: "جدة", en: "Jeddah", region: "makkah", lat: 21.5433, lng: 39.1728 },
  { slug: "taif", ar: "الطائف", en: "Taif", region: "makkah", lat: 21.2703, lng: 40.4158 },
  { slug: "riyadh", ar: "الرياض", en: "Riyadh", region: "riyadh", lat: 24.7136, lng: 46.6753 },
  { slug: "dammam", ar: "الدمام", en: "Dammam", region: "eastern", lat: 26.4207, lng: 50.0888 },
  { slug: "alula", ar: "العلا", en: "AlUla", region: "madinah", lat: 26.6084, lng: 37.9232 },
];

export const MAIN_PLACES: SeedPlace[] = [
  // Makkah
  { slug: "makkah", ar: "فنادق حول الحرم", en: "Hotels around the Haram", city: "makkah", kind: "hotels", lat: 21.4225, lng: 39.8262 },
  { slug: "makkah-far-hotels", ar: "فنادق بعيدة عن الحرم (العزيزية والششة)", en: "Hotels away from the Haram (Aziziyah)", city: "makkah", kind: "hotels", lat: 21.4045, lng: 39.8745 },
  { slug: "makkah-train", ar: "قطار الحرمين (محطة مكة)", en: "Haramain train (Makkah station)", city: "makkah", kind: "station", lat: 21.3843, lng: 39.8486 },
  { slug: "makkah-mazarat", ar: "مزارات مكة (المشاعر وجبل النور)", en: "Makkah ziyarat sites", city: "makkah", kind: "religious", lat: 21.4133, lng: 39.8933 },
  { slug: "masjid-aisha", ar: "مسجد عائشة (التنعيم)", en: "Masjid Aisha (Taneem)", city: "makkah", kind: "religious", lat: 21.4667, lng: 39.7769 },
  // Jeddah
  { slug: "jeddah-airport", ar: "مطار الملك عبدالعزيز", en: "King Abdulaziz Airport", city: "jeddah", kind: "airport", lat: 21.6796, lng: 39.1565 },
  { slug: "jeddah", ar: "فنادق جدة", en: "Jeddah hotels", city: "jeddah", kind: "hotels", lat: 21.5433, lng: 39.1728 },
  { slug: "jeddah-malls", ar: "أسواق جدة (المولات وجدة التاريخية)", en: "Jeddah malls and markets", city: "jeddah", kind: "landmark", lat: 21.6276, lng: 39.111 },
  { slug: "kaec", ar: "مدينة الملك عبدالله الاقتصادية", en: "King Abdullah Economic City", city: "jeddah", kind: "city", lat: 22.45, lng: 39.13 },
  // Madinah
  { slug: "madinah-airport", ar: "مطار الأمير محمد بن عبدالعزيز", en: "Prince Mohammed bin Abdulaziz Airport", city: "madinah", kind: "airport", lat: 24.5534, lng: 39.7051 },
  { slug: "madinah", ar: "فنادق المدينة (المنطقة المركزية)", en: "Madinah hotels (central area)", city: "madinah", kind: "hotels", lat: 24.4672, lng: 39.6111 },
  { slug: "madinah-mazarat", ar: "مزارات المدينة (قباء وأحد والقبلتين)", en: "Madinah ziyarat sites", city: "madinah", kind: "religious", lat: 24.4393, lng: 39.6172 },
  { slug: "madinah-train", ar: "قطار الحرمين (محطة المدينة)", en: "Haramain train (Madinah station)", city: "madinah", kind: "station", lat: 24.5498, lng: 39.6826 },
  { slug: "badr", ar: "بدر", en: "Badr", city: "madinah", kind: "city", lat: 23.78, lng: 38.79 },
  // Taif
  { slug: "taif-airport", ar: "مطار الطائف", en: "Taif Airport", city: "taif", kind: "airport", lat: 21.4834, lng: 40.5444 },
  { slug: "taif", ar: "فنادق الطائف", en: "Taif hotels", city: "taif", kind: "hotels", lat: 21.2703, lng: 40.4158 },
  // Riyadh
  { slug: "riyadh-airport", ar: "مطار الملك خالد الدولي", en: "King Khalid Airport", city: "riyadh", kind: "airport", lat: 24.9578, lng: 46.6989 },
  { slug: "riyadh", ar: "فنادق الرياض", en: "Riyadh hotels", city: "riyadh", kind: "hotels", lat: 24.7136, lng: 46.6753 },
  { slug: "riyadh-boulevard", ar: "بوليفارد رياض سيتي", en: "Boulevard Riyadh City", city: "riyadh", kind: "landmark", lat: 24.77, lng: 46.6 },
  { slug: "at-turaif", ar: "الدرعية", en: "Diriyah", city: "riyadh", kind: "landmark", lat: 24.734, lng: 46.5752 },
  // AlUla
  { slug: "alula-airport", ar: "مطار العلا", en: "AlUla Airport", city: "alula", kind: "airport", lat: 26.4834, lng: 38.1167 },
  { slug: "alula", ar: "فنادق العلا", en: "AlUla hotels", city: "alula", kind: "hotels", lat: 26.6084, lng: 37.9232 },
  { slug: "hegra", ar: "الحِجر (مدائن صالح)", en: "Hegra (Mada'in Salih)", city: "alula", kind: "landmark", lat: 26.792, lng: 37.9533 },
  { slug: "elephant-rock", ar: "جبل الفيل", en: "Elephant Rock", city: "alula", kind: "landmark", lat: 26.668, lng: 37.94 },
  // Dammam
  { slug: "dammam-airport", ar: "مطار الملك فهد الدولي", en: "King Fahd Airport", city: "dammam", kind: "airport", lat: 26.4712, lng: 49.7979 },
  { slug: "dammam", ar: "فنادق الدمام", en: "Dammam hotels", city: "dammam", kind: "hotels", lat: 26.4207, lng: 50.0888 },
];

/**
 * Fixed routes with sample prices (both directions, every car). The price is worked out from the
 * road distance and each car's distance rates when the route is created; edit it in Admin -> Prices.
 */
export const MAIN_ROUTES: [from: string, to: string][] = [
  // Makkah
  ["makkah", "makkah-train"],
  ["makkah", "makkah-mazarat"],
  ["makkah", "masjid-aisha"],
  ["makkah-far-hotels", "makkah"],
  ["makkah-far-hotels", "makkah-train"],
  ["makkah", "jeddah"],
  ["makkah", "jeddah-airport"],
  ["makkah-far-hotels", "jeddah-airport"],
  ["makkah", "madinah"],
  ["makkah", "taif"],
  // Jeddah
  ["jeddah-airport", "jeddah"],
  ["jeddah-airport", "jeddah-malls"],
  ["jeddah-airport", "kaec"],
  ["jeddah", "jeddah-malls"],
  ["jeddah", "kaec"],
  ["jeddah-airport", "madinah"],
  ["jeddah", "madinah"],
  // Madinah
  ["madinah-airport", "madinah"],
  ["madinah", "madinah-train"],
  ["madinah", "madinah-mazarat"],
  ["madinah", "badr"],
  // Taif
  ["taif-airport", "taif"],
  // Riyadh
  ["riyadh-airport", "riyadh"],
  ["riyadh-airport", "riyadh-boulevard"],
  ["riyadh-airport", "at-turaif"],
  ["riyadh", "riyadh-boulevard"],
  ["riyadh", "at-turaif"],
  // AlUla
  ["alula-airport", "alula"],
  ["alula-airport", "hegra"],
  ["alula", "hegra"],
  ["alula", "elephant-rock"],
  // Dammam
  ["dammam-airport", "dammam"],
];
