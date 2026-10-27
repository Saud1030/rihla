/**
 * Saudi regions -> cities -> pickup/drop-off places.
 *
 * Coordinates are approximate (good to within a few km). They are only used to
 * estimate road distance for automatic pricing; fixed route prices are not affected.
 * Everything here can be edited, hidden or extended from the admin panel (الوجهات).
 */
import type { LocationKind, RegionSlug } from "../../src/lib/regions";

export type SeedCity = { slug: string; ar: string; en: string; region: RegionSlug; lat: number; lng: number };
export type SeedPlace = { slug: string; ar: string; en: string; city: string; kind: LocationKind; lat: number; lng: number };

export const CITIES: SeedCity[] = [
  // Makkah region
  { slug: "makkah", ar: "مكة المكرمة", en: "Makkah", region: "makkah", lat: 21.4225, lng: 39.8262 },
  { slug: "jeddah", ar: "جدة", en: "Jeddah", region: "makkah", lat: 21.5433, lng: 39.1728 },
  { slug: "taif", ar: "الطائف", en: "Taif", region: "makkah", lat: 21.2703, lng: 40.4158 },
  { slug: "rabigh", ar: "رابغ", en: "Rabigh", region: "makkah", lat: 22.7986, lng: 39.0349 },
  { slug: "kaec", ar: "مدينة الملك عبدالله الاقتصادية", en: "King Abdullah Economic City", region: "makkah", lat: 22.4500, lng: 39.1300 },
  { slug: "al-lith", ar: "الليث", en: "Al Lith", region: "makkah", lat: 20.1500, lng: 40.2700 },
  { slug: "al-qunfudhah", ar: "القنفذة", en: "Al Qunfudhah", region: "makkah", lat: 19.1264, lng: 41.0789 },
  // Madinah region
  { slug: "madinah", ar: "المدينة المنورة", en: "Madinah", region: "madinah", lat: 24.4686, lng: 39.6142 },
  { slug: "alula", ar: "العلا", en: "AlUla", region: "madinah", lat: 26.6084, lng: 37.9232 },
  { slug: "yanbu", ar: "ينبع", en: "Yanbu", region: "madinah", lat: 24.0895, lng: 38.0618 },
  { slug: "badr", ar: "بدر", en: "Badr", region: "madinah", lat: 23.7800, lng: 38.7900 },
  { slug: "khaybar", ar: "خيبر", en: "Khaybar", region: "madinah", lat: 25.6960, lng: 39.2920 },
  // Riyadh region
  { slug: "riyadh", ar: "الرياض", en: "Riyadh", region: "riyadh", lat: 24.7136, lng: 46.6753 },
  { slug: "diriyah", ar: "الدرعية", en: "Diriyah", region: "riyadh", lat: 24.7370, lng: 46.5750 },
  { slug: "al-kharj", ar: "الخرج", en: "Al Kharj", region: "riyadh", lat: 24.1556, lng: 47.3346 },
  { slug: "al-majmaah", ar: "المجمعة", en: "Al Majmaah", region: "riyadh", lat: 25.9039, lng: 45.3453 },
  // Eastern Province
  { slug: "dammam", ar: "الدمام", en: "Dammam", region: "eastern", lat: 26.4207, lng: 50.0888 },
  { slug: "khobar", ar: "الخبر", en: "Al Khobar", region: "eastern", lat: 26.2172, lng: 50.1971 },
  { slug: "dhahran", ar: "الظهران", en: "Dhahran", region: "eastern", lat: 26.2880, lng: 50.1140 },
  { slug: "al-ahsa", ar: "الأحساء", en: "Al-Ahsa", region: "eastern", lat: 25.3833, lng: 49.5864 },
  { slug: "jubail", ar: "الجبيل", en: "Jubail", region: "eastern", lat: 27.0046, lng: 49.6460 },
  { slug: "qatif", ar: "القطيف", en: "Qatif", region: "eastern", lat: 26.5650, lng: 50.0120 },
  { slug: "hafar-al-batin", ar: "حفر الباطن", en: "Hafar Al-Batin", region: "eastern", lat: 28.4320, lng: 45.9710 },
  // Al-Qassim
  { slug: "buraidah", ar: "بريدة", en: "Buraidah", region: "qassim", lat: 26.3260, lng: 43.9750 },
  { slug: "unaizah", ar: "عنيزة", en: "Unaizah", region: "qassim", lat: 26.0840, lng: 43.9930 },
  { slug: "ar-rass", ar: "الرس", en: "Ar Rass", region: "qassim", lat: 25.8690, lng: 43.4970 },
  // Asir
  { slug: "abha", ar: "أبها", en: "Abha", region: "asir", lat: 18.2164, lng: 42.5053 },
  { slug: "khamis-mushait", ar: "خميس مشيط", en: "Khamis Mushait", region: "asir", lat: 18.3000, lng: 42.7300 },
  { slug: "al-namas", ar: "النماص", en: "Al Namas", region: "asir", lat: 19.1200, lng: 42.1300 },
  { slug: "bisha", ar: "بيشة", en: "Bisha", region: "asir", lat: 19.9800, lng: 42.6000 },
  // Tabuk
  { slug: "tabuk", ar: "تبوك", en: "Tabuk", region: "tabuk", lat: 28.3835, lng: 36.5662 },
  { slug: "umluj", ar: "أملج", en: "Umluj", region: "tabuk", lat: 25.0200, lng: 37.2700 },
  { slug: "al-wajh", ar: "الوجه", en: "Al Wajh", region: "tabuk", lat: 26.2400, lng: 36.4500 },
  { slug: "haql", ar: "حقل", en: "Haql", region: "tabuk", lat: 29.2900, lng: 34.9400 },
  // Hail
  { slug: "hail", ar: "حائل", en: "Hail", region: "hail", lat: 27.5114, lng: 41.7208 },
  // Northern Borders
  { slug: "arar", ar: "عرعر", en: "Arar", region: "northern-borders", lat: 30.9753, lng: 41.0381 },
  { slug: "rafha", ar: "رفحاء", en: "Rafha", region: "northern-borders", lat: 29.6300, lng: 43.5000 },
  { slug: "turaif", ar: "طريف", en: "Turaif", region: "northern-borders", lat: 31.6700, lng: 38.6500 },
  // Jazan
  { slug: "jazan", ar: "جازان", en: "Jazan", region: "jazan", lat: 16.8892, lng: 42.5511 },
  { slug: "sabya", ar: "صبيا", en: "Sabya", region: "jazan", lat: 17.1500, lng: 42.6300 },
  { slug: "farasan", ar: "جزر فرسان", en: "Farasan Islands", region: "jazan", lat: 16.7000, lng: 42.1200 },
  // Najran
  { slug: "najran", ar: "نجران", en: "Najran", region: "najran", lat: 17.4924, lng: 44.1277 },
  { slug: "sharurah", ar: "شرورة", en: "Sharurah", region: "najran", lat: 17.4700, lng: 47.1200 },
  // Al-Baha
  { slug: "al-baha", ar: "الباحة", en: "Al Baha", region: "baha", lat: 20.0129, lng: 41.4677 },
  { slug: "baljurashi", ar: "بلجرشي", en: "Baljurashi", region: "baha", lat: 19.8600, lng: 41.5600 },
  // Al-Jouf
  { slug: "sakaka", ar: "سكاكا", en: "Sakaka", region: "jouf", lat: 29.9697, lng: 40.2064 },
  { slug: "dumat-al-jandal", ar: "دومة الجندل", en: "Dumat Al-Jandal", region: "jouf", lat: 29.8100, lng: 39.8700 },
  { slug: "al-qurayyat", ar: "القريات", en: "Al Qurayyat", region: "jouf", lat: 31.3300, lng: 37.3400 },
];

/**
 * Specific places. Every city above also gets an automatic "in the city" destination
 * (unless it already has one here), so customers can book to any city.
 * The first 8 slugs existed before and keep their slugs.
 */
export const PLACES: SeedPlace[] = [
  // --- existing (kept slugs) ---
  { slug: "jeddah-airport", ar: "مطار الملك عبدالعزيز (جدة)", en: "Jeddah Airport (KAIA)", city: "jeddah", kind: "airport", lat: 21.6796, lng: 39.1565 },
  { slug: "jeddah", ar: "جدة (الفنادق والأحياء)", en: "Jeddah city", city: "jeddah", kind: "city", lat: 21.5433, lng: 39.1728 },
  { slug: "makkah", ar: "مكة المكرمة (الفنادق)", en: "Makkah hotels", city: "makkah", kind: "hotels", lat: 21.4225, lng: 39.8262 },
  { slug: "makkah-train", ar: "محطة قطار الحرمين – مكة", en: "Makkah Haramain station", city: "makkah", kind: "station", lat: 21.3843, lng: 39.8486 },
  { slug: "madinah", ar: "المدينة المنورة (الفنادق)", en: "Madinah hotels", city: "madinah", kind: "hotels", lat: 24.4672, lng: 39.6111 },
  { slug: "madinah-airport", ar: "مطار الأمير محمد بن عبدالعزيز (المدينة)", en: "Madinah Airport", city: "madinah", kind: "airport", lat: 24.5534, lng: 39.7051 },
  { slug: "madinah-train", ar: "محطة قطار الحرمين – المدينة", en: "Madinah Haramain station", city: "madinah", kind: "station", lat: 24.5498, lng: 39.6826 },
  { slug: "taif", ar: "الطائف", en: "Taif", city: "taif", kind: "city", lat: 21.2703, lng: 40.4158 },

  // --- Makkah ---
  { slug: "mina", ar: "مشعر منى", en: "Mina", city: "makkah", kind: "religious", lat: 21.4133, lng: 39.8933 },
  { slug: "arafat", ar: "مشعر عرفات", en: "Arafat", city: "makkah", kind: "religious", lat: 21.3549, lng: 39.9842 },
  { slug: "muzdalifah", ar: "مشعر مزدلفة", en: "Muzdalifah", city: "makkah", kind: "religious", lat: 21.3936, lng: 39.9311 },
  { slug: "jabal-al-nour", ar: "جبل النور (غار حراء)", en: "Jabal Al-Nour (Hira Cave)", city: "makkah", kind: "religious", lat: 21.4575, lng: 39.8617 },
  { slug: "jabal-thawr", ar: "جبل ثور", en: "Jabal Thawr", city: "makkah", kind: "religious", lat: 21.3772, lng: 39.8500 },
  { slug: "masjid-aisha", ar: "مسجد التنعيم (مسجد عائشة)", en: "Masjid Aisha (Tan'eem)", city: "makkah", kind: "religious", lat: 21.4667, lng: 39.7769 },
  { slug: "masjid-al-jiranah", ar: "مسجد الجعرانة", en: "Masjid Al-Ji'ranah", city: "makkah", kind: "religious", lat: 21.5636, lng: 39.9558 },

  // --- Jeddah ---
  { slug: "jeddah-train", ar: "محطة قطار الحرمين – جدة السليمانية", en: "Jeddah Haramain station (Sulaimaniyah)", city: "jeddah", kind: "station", lat: 21.5120, lng: 39.2360 },
  { slug: "jeddah-al-balad", ar: "جدة التاريخية (البلد)", en: "Historic Jeddah (Al-Balad)", city: "jeddah", kind: "landmark", lat: 21.4858, lng: 39.1925 },
  { slug: "jeddah-corniche", ar: "كورنيش جدة", en: "Jeddah Corniche", city: "jeddah", kind: "landmark", lat: 21.5600, lng: 39.1150 },
  { slug: "masjid-al-rahma", ar: "مسجد الرحمة (المسجد العائم)", en: "Al-Rahma Mosque (Floating Mosque)", city: "jeddah", kind: "religious", lat: 21.5477, lng: 39.1006 },
  { slug: "jeddah-port", ar: "ميناء جدة الإسلامي", en: "Jeddah Islamic Port", city: "jeddah", kind: "other", lat: 21.4700, lng: 39.1700 },

  // --- Taif ---
  { slug: "taif-airport", ar: "مطار الطائف", en: "Taif Airport", city: "taif", kind: "airport", lat: 21.4834, lng: 40.5444 },
  { slug: "al-hada", ar: "الهدا", en: "Al Hada", city: "taif", kind: "landmark", lat: 21.3700, lng: 40.2900 },
  { slug: "al-shafa", ar: "الشفا", en: "Al Shafa", city: "taif", kind: "landmark", lat: 21.0700, lng: 40.3500 },
  { slug: "souq-okaz", ar: "سوق عكاظ", en: "Souq Okaz", city: "taif", kind: "landmark", lat: 21.6560, lng: 40.3880 },
  { slug: "miqat-qarn-al-manazil", ar: "ميقات قرن المنازل (السيل الكبير)", en: "Qarn Al-Manazil Miqat (As-Sayl Al-Kabir)", city: "taif", kind: "religious", lat: 21.6297, lng: 40.4256 },

  // --- KAEC ---
  { slug: "kaec-train", ar: "محطة قطار الحرمين – مدينة الملك عبدالله الاقتصادية", en: "KAEC Haramain station", city: "kaec", kind: "station", lat: 22.3900, lng: 39.1400 },

  // --- Madinah ---
  { slug: "masjid-quba", ar: "مسجد قباء", en: "Quba Mosque", city: "madinah", kind: "religious", lat: 24.4393, lng: 39.6172 },
  { slug: "masjid-al-qiblatain", ar: "مسجد القبلتين", en: "Masjid Al-Qiblatain", city: "madinah", kind: "religious", lat: 24.4842, lng: 39.5789 },
  { slug: "jabal-uhud", ar: "جبل أحد ومقبرة الشهداء", en: "Mount Uhud & Martyrs' Cemetery", city: "madinah", kind: "religious", lat: 24.5021, lng: 39.6125 },
  { slug: "miqat-dhul-hulaifah", ar: "ميقات ذي الحليفة (أبيار علي)", en: "Dhul Hulaifah Miqat (Abyar Ali)", city: "madinah", kind: "religious", lat: 24.4135, lng: 39.5434 },
  { slug: "seven-mosques", ar: "المساجد السبعة (الخندق)", en: "The Seven Mosques (Al-Khandaq)", city: "madinah", kind: "religious", lat: 24.4775, lng: 39.5989 },

  // --- AlUla ---
  { slug: "alula-airport", ar: "مطار العلا الدولي", en: "AlUla International Airport", city: "alula", kind: "airport", lat: 26.4834, lng: 38.1167 },
  { slug: "hegra", ar: "الحِجر (مدائن صالح)", en: "Hegra (Mada'in Salih)", city: "alula", kind: "landmark", lat: 26.7920, lng: 37.9533 },
  { slug: "alula-old-town", ar: "البلدة القديمة بالعلا", en: "AlUla Old Town", city: "alula", kind: "landmark", lat: 26.6248, lng: 37.9156 },
  { slug: "elephant-rock", ar: "جبل الفيل", en: "Elephant Rock", city: "alula", kind: "landmark", lat: 26.6680, lng: 37.9400 },

  // --- Yanbu ---
  { slug: "yanbu-airport", ar: "مطار ينبع", en: "Yanbu Airport", city: "yanbu", kind: "airport", lat: 24.1442, lng: 38.0634 },

  // --- Riyadh ---
  { slug: "riyadh-airport", ar: "مطار الملك خالد الدولي (الرياض)", en: "King Khalid International Airport (Riyadh)", city: "riyadh", kind: "airport", lat: 24.9578, lng: 46.6989 },
  { slug: "riyadh-boulevard", ar: "بوليفارد رياض سيتي", en: "Boulevard Riyadh City", city: "riyadh", kind: "landmark", lat: 24.7700, lng: 46.6000 },
  { slug: "kingdom-centre", ar: "برج المملكة", en: "Kingdom Centre", city: "riyadh", kind: "landmark", lat: 24.7114, lng: 46.6744 },
  { slug: "masmak-fortress", ar: "قصر المصمك", en: "Masmak Fortress", city: "riyadh", kind: "landmark", lat: 24.6312, lng: 46.7133 },
  { slug: "national-museum", ar: "المتحف الوطني", en: "National Museum", city: "riyadh", kind: "landmark", lat: 24.6477, lng: 46.7105 },
  { slug: "edge-of-the-world", ar: "حافة العالم", en: "Edge of the World", city: "riyadh", kind: "landmark", lat: 24.9500, lng: 45.9900 },
  { slug: "at-turaif", ar: "حي الطريف بالدرعية", en: "At-Turaif District", city: "diriyah", kind: "landmark", lat: 24.7340, lng: 46.5752 },

  // --- Eastern Province ---
  { slug: "dammam-airport", ar: "مطار الملك فهد الدولي (الدمام)", en: "King Fahd International Airport (Dammam)", city: "dammam", kind: "airport", lat: 26.4712, lng: 49.7979 },
  { slug: "khobar-corniche", ar: "كورنيش الخبر", en: "Al Khobar Corniche", city: "khobar", kind: "landmark", lat: 26.2850, lng: 50.2150 },
  { slug: "king-fahd-causeway", ar: "جسر الملك فهد", en: "King Fahd Causeway", city: "khobar", kind: "other", lat: 26.2000, lng: 50.3200 },
  { slug: "ithra", ar: "إثراء (مركز الملك عبدالعزيز الثقافي العالمي)", en: "Ithra (King Abdulaziz Center for World Culture)", city: "dhahran", kind: "landmark", lat: 26.3336, lng: 50.1127 },
  { slug: "al-ahsa-airport", ar: "مطار الأحساء", en: "Al-Ahsa Airport", city: "al-ahsa", kind: "airport", lat: 25.2853, lng: 49.4852 },
  { slug: "jabal-al-qarah", ar: "جبل القارة", en: "Jabal Al-Qarah", city: "al-ahsa", kind: "landmark", lat: 25.4300, lng: 49.6600 },

  // --- Al-Qassim ---
  { slug: "qassim-airport", ar: "مطار الأمير نايف بن عبدالعزيز (القصيم)", en: "Prince Nayef bin Abdulaziz Airport (Qassim)", city: "buraidah", kind: "airport", lat: 26.3028, lng: 43.7744 },

  // --- Asir ---
  { slug: "abha-airport", ar: "مطار أبها الدولي", en: "Abha International Airport", city: "abha", kind: "airport", lat: 18.2404, lng: 42.6566 },
  { slug: "al-soudah", ar: "السودة", en: "Al Soudah", city: "abha", kind: "landmark", lat: 18.2670, lng: 42.3830 },
  { slug: "rijal-almaa", ar: "قرية رجال ألمع التراثية", en: "Rijal Almaa Heritage Village", city: "abha", kind: "landmark", lat: 18.2106, lng: 42.2765 },

  // --- Tabuk ---
  { slug: "tabuk-airport", ar: "مطار الأمير سلطان بن عبدالعزيز (تبوك)", en: "Prince Sultan bin Abdulaziz Airport (Tabuk)", city: "tabuk", kind: "airport", lat: 28.3654, lng: 36.6189 },

  // --- Hail ---
  { slug: "hail-airport", ar: "مطار حائل الدولي", en: "Hail International Airport", city: "hail", kind: "airport", lat: 27.4379, lng: 41.6863 },
  { slug: "airif-fort", ar: "قلعة عيرف", en: "A'Arif Fort", city: "hail", kind: "landmark", lat: 27.5217, lng: 41.6987 },
  { slug: "jubbah-rock-art", ar: "الرسوم الصخرية في جبة", en: "Jubbah Rock Art", city: "hail", kind: "landmark", lat: 28.0200, lng: 40.9200 },

  // --- Northern Borders ---
  { slug: "arar-airport", ar: "مطار عرعر", en: "Arar Airport", city: "arar", kind: "airport", lat: 30.9066, lng: 41.1382 },

  // --- Jazan ---
  { slug: "jazan-airport", ar: "مطار جازان", en: "Jazan Airport", city: "jazan", kind: "airport", lat: 16.9011, lng: 42.5858 },

  // --- Najran ---
  { slug: "najran-airport", ar: "مطار نجران", en: "Najran Airport", city: "najran", kind: "airport", lat: 17.6114, lng: 44.4192 },
  { slug: "al-ukhdood", ar: "موقع الأخدود الأثري", en: "Al-Ukhdood Archaeological Site", city: "najran", kind: "landmark", lat: 17.4806, lng: 44.1758 },

  // --- Al-Baha ---
  { slug: "baha-airport", ar: "مطار الباحة", en: "Al-Baha Airport", city: "al-baha", kind: "airport", lat: 20.2961, lng: 41.6343 },
  { slug: "dhee-ain", ar: "قرية ذي عين الأثرية", en: "Dhee Ain Heritage Village", city: "al-baha", kind: "landmark", lat: 19.9280, lng: 41.4430 },
  { slug: "raghadan-forest", ar: "غابة رغدان", en: "Raghadan Forest", city: "al-baha", kind: "landmark", lat: 20.0200, lng: 41.4200 },

  // --- Al-Jouf ---
  { slug: "jouf-airport", ar: "مطار الجوف", en: "Al-Jouf Airport", city: "sakaka", kind: "airport", lat: 29.7851, lng: 40.1000 },
  { slug: "zaabal-castle", ar: "قلعة زعبل", en: "Za'abal Castle", city: "sakaka", kind: "landmark", lat: 29.9839, lng: 40.2100 },
];
