import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { extraAllowedHosts, hostAllowed } from "@/lib/http";

const LOCALES = ["ar", "en"];
const ADMIN_COOKIE = "admin_session";

function preferredLocale(req: NextRequest) {
  const header = req.headers.get("accept-language") ?? "";
  // pick the first of our locales that appears in the header, by order of preference
  const langs = header
    .split(",")
    .map((p) => p.split(";")[0].trim().slice(0, 2).toLowerCase())
    .filter(Boolean);
  return langs.find((l) => LOCALES.includes(l)) ?? "ar";
}

/**
 * Redirect on this site. Behind a proxy (e.g. GitHub Codespaces) the public host comes in
 * x-forwarded-host; it is used only when it is one of SERVER_ACTIONS_ALLOWED_ORIGINS.
 */
function redirectTo(req: NextRequest, path: string) {
  const fwd = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const base = fwd && hostAllowed(fwd, extraAllowedHosts()) ? `https://${fwd}` : req.nextUrl.origin;
  return NextResponse.redirect(new URL(path, base));
}

async function hasValidAdminSession(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Admin area: bounce to login early. Every admin page and action checks again on the server.
  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login") return NextResponse.next();
    if (!(await hasValidAdminSession(req))) return redirectTo(req, "/admin/login");
    return NextResponse.next();
  }

  // Public site: make sure every path starts with a locale
  const hasLocale = LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
  if (hasLocale) return NextResponse.next();

  return redirectTo(req, `/${preferredLocale(req)}${pathname === "/" ? "" : pathname}${req.nextUrl.search}`);
}

export const config = {
  // skip API routes, Next internals and files with an extension (images, svg, robots.txt ...)
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
