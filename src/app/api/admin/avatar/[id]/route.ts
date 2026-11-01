import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { getSession } from "@/lib/auth";

/** An admin account's photo (signed-in panel users only) */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/avatar/[id]">) {
  const { id } = await ctx.params;
  if (!(await getSession()) || !/^\d{1,9}$/.test(id)) return new Response("Not found", { status: 404 });
  const [row] = await db.select().from(s.assets).where(eq(s.assets.key, `avatar-${id}`)).limit(1);
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: { "Content-Type": row.mime, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
