"use server";

import { revalidatePath } from "next/cache";
import { and, like, notInArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireSection } from "@/lib/auth";
import { getSettings, invalidateCatalogCache } from "@/lib/catalog";
import { detectFile, IMAGE_TYPES, MB } from "@/lib/files";
import { parseFooter } from "@/lib/footer";
import type { ActionState } from "./actions";

/** The footer builder: columns, items, pictures and payment logos, saved in one go */
export async function saveFooterBlocks(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSection("appearance");
  const json = String(formData.get("config") ?? "");
  if (json.length > 200_000) return { error: "محتوى التذييل كبير جدًا." };
  const st = await getSettings();
  const cfg = parseFooter(json || undefined, st);
  if (!json) return { error: "لم يصل محتوى التذييل. حدّث الصفحة وحاول مرة أخرى." };

  // the pictures picked in this save: img_<id>
  const slots = [...cfg.columns.flatMap((c) => c.items), ...cfg.pay];
  const uploads: { id: string; mime: string; data: Buffer }[] = [];
  for (const slot of slots) {
    const file = formData.get(`img_${slot.id}`);
    if (!(file instanceof File) || file.size === 0) continue;
    if (file.size > MB) return { error: `الصورة «${file.name}» أكبر من ١ ميجابايت.` };
    const data = Buffer.from(await file.arrayBuffer());
    const kind = detectFile(data, IMAGE_TYPES);
    if (!kind) return { error: `الملف «${file.name}» ليس صورة PNG أو JPG أو WEBP.` };
    uploads.push({ id: slot.id, mime: kind.mime, data });
  }
  const version = Date.now().toString(36);
  for (const u of uploads) {
    const slot = slots.find((x) => x.id === u.id)!;
    slot.img = version;
  }
  const kept = slots.filter((x) => x.img).map((x) => `footer:${x.id}`);

  await db.transaction(async (tx) => {
    for (const u of uploads) {
      await tx
        .insert(s.assets)
        .values({ key: `footer:${u.id}`, mime: u.mime, data: u.data, updatedAt: new Date() })
        .onConflictDoUpdate({ target: s.assets.key, set: { mime: u.mime, data: u.data, updatedAt: new Date() } });
    }
    // pictures of removed items, or removed pictures
    await tx
      .delete(s.assets)
      .where(kept.length ? and(like(s.assets.key, "footer:%"), notInArray(s.assets.key, kept)) : like(s.assets.key, "footer:%"));
    const value = JSON.stringify(cfg);
    await tx.insert(s.settings).values({ key: "footer_blocks", value }).onConflictDoUpdate({ target: s.settings.key, set: { value } });
  });
  invalidateCatalogCache();
  revalidatePath("/admin/appearance");
  return { ok: true, message: cfg.custom ? "تم حفظ التذييل. افتح الموقع لترى التغيير." : "تم الحفظ. التذييل المخصص غير مفعّل، فيظهر التذييل البسيط." };
}
