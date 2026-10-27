import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { site } from "@/config/site";
import type { Locale } from "@/i18n/dictionaries";
import { getSettings } from "./catalog";
import { cached } from "./memo";
import { parseTheme, themeCss, type Theme } from "./theme";

export type Brand = {
  name: { ar: string; en: string };
  /** short text shown inside the logo sign when there's no uploaded logo */
  mark: { ar: string; en: string };
  /** /api/brand/logo?v=..., or null when no logo is uploaded */
  logoUrl: string | null;
  theme: Theme;
  css: string;
  hero: { title: Record<Locale, string>; lead: Record<Locale, string> };
};

const logoVersion = cache(() =>
  cached("logo-version", async () => {
    const [row] = await db.select({ updatedAt: s.assets.updatedAt }).from(s.assets).where(eq(s.assets.key, "logo")).limit(1);
    return row ? row.updatedAt.getTime().toString(36) : null;
  }),
);

/** Company name, logo and look, as edited in Admin -> Appearance (falls back to src/config/site.ts) */
export const getBrand = cache(async (): Promise<Brand> => {
  const [st, v] = await Promise.all([getSettings(), logoVersion()]);
  const theme = parseTheme(st.theme);
  const val = (k: string, fallback: string) => (st[k]?.trim() ? st[k].trim() : fallback);
  return {
    name: { ar: val("company_name_ar", site.name.ar), en: val("company_name_en", site.name.en) },
    mark: { ar: val("logo_text_ar", site.mark.ar), en: val("logo_text_en", site.mark.en) },
    logoUrl: v ? `/api/brand/logo?v=${v}` : null,
    theme,
    css: themeCss(theme),
    hero: {
      title: { ar: st.hero_title_ar ?? "", en: st.hero_title_en ?? "" },
      lead: { ar: st.hero_lead_ar ?? "", en: st.hero_lead_en ?? "" },
    },
  };
});

/* ---------- Background image behind the home page's top section ---------- */

const heroVersion = cache(() =>
  cached("hero-version", async () => {
    const [row] = await db.select({ updatedAt: s.assets.updatedAt }).from(s.assets).where(eq(s.assets.key, "hero")).limit(1);
    return row ? row.updatedAt.getTime().toString(36) : null;
  }),
);

export type HeroOverlay = "light" | "medium" | "strong";
export const HERO_OVERLAYS: HeroOverlay[] = ["light", "medium", "strong"];

/** The uploaded background, or null when there is none or it's switched off in the admin panel */
export const getHeroBackground = cache(async () => {
  const [st, v] = await Promise.all([getSettings(), heroVersion()]);
  if (!v || st.hero_bg_enabled === "0") return null;
  const overlay: HeroOverlay = (HERO_OVERLAYS as string[]).includes(st.hero_bg_overlay) ? (st.hero_bg_overlay as HeroOverlay) : "medium";
  return { url: `/api/brand/hero?v=${v}`, overlay };
});
