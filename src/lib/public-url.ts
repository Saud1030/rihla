import "server-only";
import { headers } from "next/headers";
import { site } from "@/config/site";
import { extraAllowedHosts, hostAllowed } from "./http";

/**
 * The address customers reach this site on, for links that leave the site (payment return,
 * WhatsApp messages). Normally NEXT_PUBLIC_SITE_URL. When running on your own computer and
 * sharing it through a tunnel (VS Code "Ports", npm run local), SITE_URL_FROM_REQUEST=1 takes it
 * from the request instead, so links work both on localhost and on the shared address.
 * Outside a request (background job) it falls back to NEXT_PUBLIC_SITE_URL.
 */
export async function publicBaseUrl(): Promise<string> {
  const fallback = site.url.replace(/\/$/, "");
  if (process.env.SITE_URL_FROM_REQUEST !== "1") return fallback;
  try {
    const h = await headers();
    const isLocal = (host: string) => /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
    // a tunnel (VS Code Ports, Codespaces) names the public address here; it may rewrite Origin to localhost
    const fwd = h.get("x-forwarded-host")?.split(",")[0]?.trim();
    if (fwd && !isLocal(fwd) && hostAllowed(fwd, extraAllowedHosts())) return `https://${fwd}`;
    // form posts carry the address the visitor actually used
    const origin = h.get("origin");
    if (origin) {
      const o = new URL(origin);
      if (isLocal(o.host) || hostAllowed(o.hostname, extraAllowedHosts())) return o.origin;
    }
    const host = h.get("host");
    if (host && isLocal(host)) return `http://${host}`;
    if (host && hostAllowed(host.split(":")[0], extraAllowedHosts())) return `https://${host}`;
  } catch {
    // not inside a request
  }
  return fallback;
}
