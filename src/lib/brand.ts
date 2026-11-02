import "server-only";
import { cache } from "react";
import { eq, inArray } from "drizzle-orm";
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
  /** name of the uploaded font, when there is one */
  customFont: string | null;
  hero: { title: Record<Locale, string>; lead: Record<Locale, string>; mode: "default" | "custom" | "hidden" };
};

const logoVersion = cache(() =>
  cached("logo-version", async () => {
    const [row] = await db.select({ updatedAt: s.assets.updatedAt }).from(s.assets).where(eq(s.assets.key, "logo")).limit(1);
    return row ? row.updatedAt.getTime().toString(36) : null;
  }),
);

/** the uploaded font file (e.g. Expo Arabic): its version, or null */
export const customFontVersion = cache(() =>
  cached("font-version", async () => {
    const [row] = await db.select({ updatedAt: s.assets.updatedAt }).from(s.assets).where(eq(s.assets.key, "font-custom")).limit(1);
    return row ? row.updatedAt.getTime().toString(36) : null;
  }),
);
/** @font-face for the uploaded font; it is only downloaded by browsers when the theme uses it */
export const customFontCss = (v: string | null) =>
  v ? `@font-face{font-family:"Brand Font";src:url("/api/brand/font?v=${v}");font-display:swap}` : "";

/** Company name, logo and look, as edited in Admin -> Appearance (falls back to src/config/site.ts) */
export const getBrand = cache(async (): Promise<Brand> => {
  const [st, v, fv] = await Promise.all([getSettings(), logoVersion(), customFontVersion()]);
  const theme = parseTheme(st.theme);
  const val = (k: string, fallback: string) => (st[k]?.trim() ? st[k].trim() : fallback);
  return {
    name: { ar: val("company_name_ar", site.name.ar), en: val("company_name_en", site.name.en) },
    mark: { ar: val("logo_text_ar", site.mark.ar), en: val("logo_text_en", site.mark.en) },
    logoUrl: v ? `/api/brand/logo?v=${v}` : null,
    theme,
    css: customFontCss(fv) + themeCss(theme),
    customFont: fv ? st.font_custom_name?.trim() || "خطي المرفوع" : null,
    hero: {
      title: { ar: st.hero_title_ar ?? "", en: st.hero_title_en ?? "" },
      lead: { ar: st.hero_lead_ar ?? "", en: st.hero_lead_en ?? "" },
      // older settings: own text if any was typed, else the default
      mode: st.hero_text_mode === "custom" || st.hero_text_mode === "hidden" || st.hero_text_mode === "default" ? st.hero_text_mode : st.hero_title_ar || st.hero_lead_ar ? "custom" : "default",
    },
  };
});

/* ---------- Background image behind the home page's top section ---------- */

/** up to five background photos; they take turns behind the top section */
export const HERO_SLOTS = ["hero", "hero-2", "hero-3", "hero-4", "hero-5"] as const;
export const isHeroSlot = (k: string): k is (typeof HERO_SLOTS)[number] => (HERO_SLOTS as readonly string[]).includes(k);

export const heroImages = cache(() =>
  cached("hero-images", async () => {
    const rows = await db.select({ key: s.assets.key, updatedAt: s.assets.updatedAt }).from(s.assets).where(inArray(s.assets.key, [...HERO_SLOTS]));
    return HERO_SLOTS.flatMap((k) => {
      const r = rows.find((x) => x.key === k);
      return r ? [{ key: k, url: `/api/brand/hero?k=${k}&v=${r.updatedAt.getTime().toString(36)}` }] : [];
    });
  }),
);

export type HeroOverlay = "light" | "medium" | "strong";
export const HERO_OVERLAYS: HeroOverlay[] = ["light", "medium", "strong"];

/** The uploaded backgrounds, or null when there are none or they're switched off in the admin panel */
export const getHeroBackground = cache(async () => {
  const [st, images] = await Promise.all([getSettings(), heroImages()]);
  if (!images.length || st.hero_bg_enabled === "0") return null;
  const overlay: HeroOverlay = (HERO_OVERLAYS as string[]).includes(st.hero_bg_overlay) ? (st.hero_bg_overlay as HeroOverlay) : "medium";
  return {
    images,
    overlay,
    /** slow zoom on the photo, and photos taking turns */
    animate: st.hero_bg_animate !== "0",
    seconds: Math.min(30, Math.max(3, Number(st.hero_bg_seconds) || 7)),
  };
});
