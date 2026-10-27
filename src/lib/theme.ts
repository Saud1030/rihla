/**
 * Site appearance: colour presets, fonts and corner styles.
 * Pure functions, safe on both server and client (used for the live preview).
 */

export type Theme = {
  preset: string;
  /** main brand colour: header logo, buttons, road-sign panels */
  primary: string;
  /** highlight colour: notice bar, search button (dark text sits on it) */
  accent: string;
  /** page background */
  background: string;
  font: FontKey;
  corners: CornerKey;
};

export const PRESETS: { key: string; ar: string; en: string; primary: string; accent: string; background: string }[] = [
  { key: "road-sign", ar: "لوحات الطرق (الافتراضي)", en: "Road sign", primary: "#0b5d45", accent: "#f2b53a", background: "#eef1ec" },
  { key: "maroon", ar: "عنابي وذهبي", en: "Maroon & gold", primary: "#7a1f2b", accent: "#d9a93c", background: "#f6f1ee" },
  { key: "navy", ar: "كحلي بحري", en: "Navy", primary: "#123f6b", accent: "#41c2b2", background: "#edf2f6" },
  { key: "desert", ar: "صحراوي", en: "Desert", primary: "#6b4423", accent: "#e7a740", background: "#f5efe6" },
  { key: "charcoal", ar: "فحمي وبرتقالي", en: "Charcoal & orange", primary: "#2b2f33", accent: "#f08a3c", background: "#f1f1ef" },
  { key: "royal", ar: "بنفسجي ملكي", en: "Royal purple", primary: "#4a2a7a", accent: "#e8b84a", background: "#f3f0f6" },
];

export const FONTS = {
  readex: { ar: "ريدكس + بلكس (الافتراضي)", display: '"Readex Pro Variable"', body: '"IBM Plex Sans Arabic"' },
  tajawal: { ar: "تجوال", display: '"Tajawal"', body: '"Tajawal"' },
  cairo: { ar: "القاهرة", display: '"Cairo Variable"', body: '"Cairo Variable"' },
  almarai: { ar: "المراعي", display: '"Almarai"', body: '"Almarai"' },
  kufi: { ar: "نوتو كوفي + بلكس", display: '"Noto Kufi Arabic Variable"', body: '"IBM Plex Sans Arabic"' },
  plex: { ar: "بلكس العربي", display: '"IBM Plex Sans Arabic"', body: '"IBM Plex Sans Arabic"' },
} as const;
export type FontKey = keyof typeof FONTS;

export const CORNERS = {
  sharp: { ar: "حادة", md: "0.125rem", lg: "0.25rem", xl: "0.25rem", sign: "4px", field: "4px" },
  medium: { ar: "متوسطة (الافتراضي)", md: "0.375rem", lg: "0.5rem", xl: "0.75rem", sign: "14px", field: "8px" },
  round: { ar: "دائرية", md: "0.75rem", lg: "1rem", xl: "1.5rem", sign: "22px", field: "14px" },
} as const;
export type CornerKey = keyof typeof CORNERS;

export const DEFAULT_THEME: Theme = {
  preset: "road-sign",
  primary: PRESETS[0].primary,
  accent: PRESETS[0].accent,
  background: PRESETS[0].background,
  font: "readex",
  corners: "medium",
};

const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v);

/** Parse the stored JSON, falling back to defaults for anything missing or invalid */
export function parseTheme(raw: string | undefined | null): Theme {
  let t: Partial<Theme> = {};
  try {
    t = raw ? JSON.parse(raw) : {};
  } catch {
    t = {};
  }
  return {
    preset: typeof t.preset === "string" ? t.preset : DEFAULT_THEME.preset,
    primary: isHex(t.primary) ? t.primary : DEFAULT_THEME.primary,
    accent: isHex(t.accent) ? t.accent : DEFAULT_THEME.accent,
    background: isHex(t.background) ? t.background : DEFAULT_THEME.background,
    font: t.font && t.font in FONTS ? t.font : DEFAULT_THEME.font,
    corners: t.corners && t.corners in CORNERS ? t.corners : DEFAULT_THEME.corners,
  };
}

/* ---------- colour math ---------- */

type RGB = [number, number, number];
const toRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const toHex = (c: RGB) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const mix = (a: string, b: string, t: number) => {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as RGB);
};

function luminance(hex: string) {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Readability problems with a theme, in Arabic, for the admin form */
export function themeWarnings(t: Theme): string[] {
  const w: string[] = [];
  if (contrast("#ffffff", t.primary) < 4.5) w.push("اللون الأساسي فاتح جدًا: النص الأبيض على الأزرار لن يكون واضحًا. اختر لونًا أغمق.");
  if (contrast("#17201d", t.accent) < 4.5) w.push("لون التمييز غامق جدًا: النص الداكن عليه لن يكون واضحًا. اختر لونًا أفتح.");
  if (contrast("#17201d", t.background) < 7) w.push("لون الخلفية غامق: النص قد يصعب قراءته. اختر خلفية فاتحة.");
  return w;
}

/** CSS custom properties for the theme; overrides the defaults in globals.css */
export function themeCss(t: Theme) {
  const f = FONTS[t.font];
  const c = CORNERS[t.corners];
  const vars: Record<string, string> = {
    "--color-sign": t.primary,
    "--color-sign-deep": mix(t.primary, "#000000", 0.32),
    "--color-sign-soft": mix(t.primary, "#ffffff", 0.88),
    "--color-amber": t.accent,
    "--color-amber-deep": mix(t.accent, "#000000", 0.42),
    "--color-stone": t.background,
    "--color-line": mix(t.background, "#17201d", 0.13),
    "--font-display": `${f.display}, "IBM Plex Sans Arabic", system-ui, sans-serif`,
    "--font-sans": `${f.body}, "IBM Plex Sans Arabic", system-ui, sans-serif`,
    "--radius-md": c.md,
    "--radius-lg": c.lg,
    "--radius-xl": c.xl,
    "--radius-sign": c.sign,
    "--radius-field": c.field,
  };
  return `:root{${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";")}}`;
}
