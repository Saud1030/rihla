import type { Metadata } from "next";

/** /api/brand/favicon draws the logo on a square; the logo's version keeps browsers from showing an old one */
export function favicons(logoUrl: string | null): Metadata["icons"] {
  const v = logoUrl ? `&v=${new URL(logoUrl, "http://x").searchParams.get("v")}` : "";
  return {
    icon: [
      { url: `/api/brand/favicon?size=32${v}`, sizes: "32x32", type: "image/png" },
      { url: `/api/brand/favicon?size=192${v}`, sizes: "192x192", type: "image/png" },
    ],
    shortcut: `/api/brand/favicon?size=32${v}`,
    apple: { url: `/api/brand/favicon?size=180${v}`, sizes: "180x180" },
  };
}
