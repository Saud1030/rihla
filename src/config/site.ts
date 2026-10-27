/**
 * Brand basics. Change these once for your company.
 * Phone numbers, WhatsApp, address and the notice banner are edited from
 * the admin panel (Settings) instead.
 */
export const site = {
  name: { ar: "رحلة للنقل", en: "Rihla Transport" },
  /** short mark shown inside the logo sign */
  mark: { ar: "رحلة", en: "Rihla" },
  // on Vercel without NEXT_PUBLIC_SITE_URL, the project's own address (e.g. rihla.vercel.app)
  url:
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
};
