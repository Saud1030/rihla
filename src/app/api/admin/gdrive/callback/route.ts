import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/catalog";
import { finishConnect, gdriveApp } from "@/lib/gdrive";
import { publicBaseUrl } from "@/lib/public-url";

/** Google sends the admin back here after he approved (or declined) */
export async function GET(req: Request) {
  if (!can(await getSession(), "settings")) return new Response("Not found", { status: 404 });
  const base = await publicBaseUrl();
  const back = (result: string) => Response.redirect(`${base}/admin/integrations?gdrive=${result}#gdrive`, 303);
  const sp = new URL(req.url).searchParams;
  const jar = await cookies();
  const expected = jar.get("gd_state")?.value ?? "";
  jar.delete({ name: "gd_state", path: "/api/admin/gdrive" });
  const got = sp.get("state") ?? "";
  if (!expected || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) return back("state");
  if (sp.get("error")) return back("denied");
  const code = sp.get("code");
  const cfg = gdriveApp(await getSettings());
  if (!code || !cfg) return back("failed");
  try {
    await finishConnect(cfg, base, code);
  } catch (e) {
    console.error("[gdrive] connect failed:", e instanceof Error ? e.message : e);
    return back("failed");
  }
  return back("connected");
}
