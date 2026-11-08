import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { invalidateCatalogCache } from "@/lib/catalog";
import { isSlot, MAX_VIDEO_MB, sniffVideo } from "@/lib/promo-video";

/**
 * Upload (POST) or remove (DELETE) one promo video file. A route of its own because videos are
 * far bigger than the limit on form actions. Signed-in admins with the Appearance section only,
 * and only from the site's own pages.
 */
async function guard(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let fromHere = false;
  try {
    fromHere = !!origin && !!host && new URL(origin).host === host;
  } catch {}
  if (!fromHere) return Response.json({ error: "طلب من مصدر غير معروف." }, { status: 403 });
  const session = await getSession();
  if (!session || !can(session, "appearance")) return Response.json({ error: "سجّل الدخول بحساب له صلاحية المظهر." }, { status: 401 });
  return null;
}

const done = () => {
  invalidateCatalogCache();
  revalidatePath("/admin/appearance");
  revalidatePath("/[lang]", "page");
};

export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  const slot = new URL(req.url).searchParams.get("slot");
  if (!isSlot(slot)) return Response.json({ error: "خانة غير معروفة." }, { status: 400 });
  const max = MAX_VIDEO_MB * 1024 * 1024;
  if (Number(req.headers.get("content-length") ?? 0) > max) return Response.json({ error: `حجم الفيديو أكبر من ${MAX_VIDEO_MB} ميجابايت.` }, { status: 413 });
  // the raw file is the request body (no form encoding)
  const reader = req.body?.getReader();
  if (!reader) return Response.json({ error: "لم يصل الملف." }, { status: 400 });
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done: end, value } = await reader.read();
    if (end) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      return Response.json({ error: `حجم الفيديو أكبر من ${MAX_VIDEO_MB} ميجابايت.` }, { status: 413 });
    }
    parts.push(value);
  }
  if (!total) return Response.json({ error: "الملف فارغ." }, { status: 400 });
  const data = Buffer.concat(parts);
  const mime = sniffVideo(data.subarray(0, 16));
  if (!mime) return Response.json({ error: "الملف ليس فيديو MP4 أو WebM." }, { status: 415 });
  await db
    .insert(s.assets)
    .values({ key: `video:${slot}`, mime, data, updatedAt: new Date() })
    .onConflictDoUpdate({ target: s.assets.key, set: { mime, data, updatedAt: new Date() } });
  done();
  return Response.json({ ok: true, size: total });
}

export async function DELETE(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  const slot = new URL(req.url).searchParams.get("slot");
  if (!isSlot(slot)) return Response.json({ error: "خانة غير معروفة." }, { status: 400 });
  await db.delete(s.assets).where(and(eq(s.assets.key, `video:${slot}`)));
  done();
  return Response.json({ ok: true });
}
