import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";

/**
 * The browser tab icon: the company logo (Admin -> Appearance) on a square, transparent canvas.
 * ?size=32 (tab), 180 (iPhone home screen), 192/512 (Android). No logo yet: the default icon.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const size = [16, 32, 48, 64, 180, 192, 512].includes(Number(url.searchParams.get("size"))) ? Number(url.searchParams.get("size")) : 64;
  const cache = url.searchParams.has("v") ? "public, max-age=31536000, immutable" : "public, max-age=300";
  const [row] = await db.select().from(s.assets).where(eq(s.assets.key, "logo")).limit(1);
  if (row) {
    try {
      const png = await sharp(Buffer.from(row.data), { density: 300 })
        .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": cache, "X-Content-Type-Options": "nosniff" } });
    } catch {
      // a logo sharp can't read: fall through to the default icon
    }
  }
  const ico = await readFile(path.join(process.cwd(), "public", "default-favicon.ico"));
  return new Response(new Uint8Array(ico), { headers: { "Content-Type": "image/x-icon", "Cache-Control": "public, max-age=300" } });
}
