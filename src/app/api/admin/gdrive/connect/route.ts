import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/catalog";
import { authUrl, gdriveApp } from "@/lib/gdrive";
import { publicBaseUrl } from "@/lib/public-url";

/** "Connect Google Drive": off to Google's consent page, with a one-time state kept in a cookie */
export async function GET() {
  if (!can(await getSession(), "settings")) return new Response("Not found", { status: 404 });
  const cfg = gdriveApp(await getSettings());
  const base = await publicBaseUrl();
  if (!cfg) return Response.redirect(`${base}/admin/integrations?gdrive=noapp#gdrive`, 303);
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set("gd_state", state, { httpOnly: true, sameSite: "lax", secure: base.startsWith("https://"), path: "/api/admin/gdrive", maxAge: 600 });
  return Response.redirect(authUrl(cfg, base, state), 303);
}
