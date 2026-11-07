/**
 * Ready-made home banners (Admin -> Banners -> "add the ready banners"): artwork in public/banners/ready,
 * the words written by the site on the artwork's empty side, in Arabic and English.
 */
export type ReadyBanner = {
  key: string;
  tone: "dark" | "light";
  link: string;
  titleAr: string;
  titleEn: string;
  textAr: string;
  textEn: string;
  ctaAr: string;
  ctaEn: string;
};

export const READY_BANNERS: ReadyBanner[] = [
  {
    key: "airport",
    tone: "dark",
    link: "/ar#search",
    titleAr: "من المطار إلى الحرم",
    titleEn: "From the airport to the Haram",
    textAr: "سعر ثابت تعرفه قبل الحجز، وسائق مرخّص وسيارة نظيفة بانتظارك.",
    textEn: "A fixed price you see before you book, a licensed driver and a clean car.",
    ctaAr: "احجز رحلتك",
    ctaEn: "Book your ride",
  },
  {
    key: "hourly",
    tone: "light",
    link: "/ar#search",
    titleAr: "سيارة مع سائق بالساعة",
    titleEn: "A car with a driver, by the hour",
    textAr: "اختر عدد الساعات وشوف السعر فورًا، ومشاويرك في المدينة على راحتك.",
    textEn: "Pick the hours and see the price right away — your errands around the city, your way.",
    ctaAr: "احجز بالساعة",
    ctaEn: "Book by the hour",
  },
  {
    key: "packages",
    tone: "dark",
    link: "/ar/packages",
    titleAr: "مكة والمدينة في باقة واحدة",
    titleEn: "Makkah and Madinah in one package",
    textAr: "كل تنقلاتك في رحلة العمرة والزيارة بسعر واحد، وادفعها على دفعات.",
    textEn: "All your rides for Umrah and Ziyarah at one price, paid in instalments.",
    ctaAr: "شوف الباقات",
    ctaEn: "See the packages",
  },
  {
    key: "fleet",
    tone: "light",
    link: "/ar/fleet",
    titleAr: "سيارة تناسب كل عائلة",
    titleEn: "A car for every family",
    textAr: "من السيدان إلى الحافلة، شوف عدد المقاعد والحقائب قبل ما تحجز.",
    textEn: "From sedans to coaches — see the seats and bags before you book.",
    ctaAr: "تصفّح السيارات",
    ctaEn: "Browse the cars",
  },
  {
    key: "join",
    tone: "dark",
    link: "/ar/drivers/join",
    titleAr: "انضم لفريق السائقين",
    titleEn: "Drive with us",
    textAr: "سجّل بسيارتك واستقبل رحلات من الموقع مباشرة.",
    textEn: "Sign up with your car and get trips straight from the site.",
    ctaAr: "سجّل الآن",
    ctaEn: "Join now",
  },
];

/** a link to a page of the site in the visitor's language ("/ar/fleet" on the English site -> "/en/fleet") */
export function localLink(link: string, lang: "ar" | "en") {
  return link.replace(/^\/(ar|en)(?=\/|#|\?|$)/, `/${lang}`);
}
