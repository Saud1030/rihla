import "server-only";
/**
 * The promo video on the home page (Admin -> Appearance -> Promo video).
 * Up to four files: Arabic / English, vertical (phones) / horizontal (computers), stored in `assets`
 * as `video:<slot>`; shown when the `promo_video_on` setting is "1".
 */
import { inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { cached } from "./memo";

export const VIDEO_SLOTS = ["ar-v", "ar-h", "en-v", "en-h"] as const;
export type VideoSlot = (typeof VIDEO_SLOTS)[number];
export const MAX_VIDEO_MB = 40;

export const isSlot = (v: unknown): v is VideoSlot => typeof v === "string" && (VIDEO_SLOTS as readonly string[]).includes(v);

/** MP4 (…ftyp at byte 4) or WebM (EBML header); anything else is refused */
export function sniffVideo(head: Uint8Array): "video/mp4" | "video/webm" | null {
  if (head.length >= 12 && String.fromCharCode(head[4], head[5], head[6], head[7]) === "ftyp") return "video/mp4";
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "video/webm";
  return null;
}

/** which slots have a file, with a version for the URL (no video bytes are read) */
export const promoVideoVersions = () =>
  cached("promo-video-versions", async () => {
    const rows = await db
      .select({ key: s.assets.key, updatedAt: s.assets.updatedAt })
      .from(s.assets)
      .where(inArray(s.assets.key, VIDEO_SLOTS.map((x) => `video:${x}`)));
    const out: Partial<Record<VideoSlot, string>> = {};
    for (const r of rows) out[r.key.slice(6) as VideoSlot] = r.updatedAt.getTime().toString(36);
    return out;
  });

export const videoUrl = (slot: VideoSlot, v: string) => `/api/brand/video/${slot}?v=${v}`;

/** what the home page shows for a language: the vertical and horizontal files, borrowing from the other language when one is missing */
export function pickVideos(have: Partial<Record<VideoSlot, string>>, lang: "ar" | "en") {
  const other = lang === "ar" ? "en" : "ar";
  const get = (o: "v" | "h") => {
    for (const l of [lang, other]) {
      const slot = `${l}-${o}` as VideoSlot;
      if (have[slot]) return videoUrl(slot, have[slot]!);
    }
    return null;
  };
  const v = get("v"), h = get("h");
  // one orientation only: it's used on every screen
  return { vertical: v ?? h, horizontal: h ?? v };
}
