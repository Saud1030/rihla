import "server-only";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";

/**
 * The uploaded company logo as PNG or JPEG, for files the server makes (PDF, Excel), which can't take SVG or WEBP.
 * SVG / WEBP logos are turned into PNG with sharp when it is installed; null when there's no logo or it can't be converted.
 */
export async function logoForFiles(): Promise<{ data: Buffer; ext: "png" | "jpeg"; w: number; h: number } | null> {
  const [row] = await db.select().from(s.assets).where(eq(s.assets.key, "logo")).limit(1);
  if (!row) return null;
  try {
    const sharp = (await import("sharp")).default;
    const img = sharp(Buffer.from(row.data), { density: 300 }).resize({ height: 240, withoutEnlargement: row.mime !== "image/svg+xml" }).png();
    const { data, info } = await img.toBuffer({ resolveWithObject: true });
    return { data, ext: "png", w: info.width, h: info.height };
  } catch {
    // no sharp: PNG and JPEG still work as they are
    const data = Buffer.from(row.data);
    if (row.mime === "image/png" && data.length > 24) return { data, ext: "png", w: data.readUInt32BE(16), h: data.readUInt32BE(20) };
    if (row.mime === "image/jpeg") return { data, ext: "jpeg", w: 0, h: 0 };
    return null;
  }
}
