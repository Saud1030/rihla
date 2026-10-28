/**
 * A 303 redirect to a path on this site. The Location is relative on purpose:
 * behind a proxy or a preview domain (e.g. GitHub Codespaces) the server may not
 * know its public address, and the browser resolves a relative path correctly.
 */
export function seeOther(path: string, params?: URLSearchParams, hash?: string) {
  const qs = params?.toString();
  return new Response(null, { status: 303, headers: { Location: `${path}${qs ? `?${qs}` : ""}${hash ? `#${hash}` : ""}` } });
}

/** Extra hosts allowed to post to this site (proxies, preview domains), from SERVER_ACTIONS_ALLOWED_ORIGINS */
export function extraAllowedHosts() {
  return (process.env.SERVER_ACTIONS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** host matches an entry like "example.com", "*.app.github.dev" or "**.devtunnels.ms" (any subdomain) */
export function hostAllowed(host: string, patterns: string[]) {
  return patterns.some((p) => {
    const suffix = p.startsWith("**.") ? p.slice(2) : p.startsWith("*.") ? p.slice(1) : null;
    return suffix ? host.endsWith(suffix) && host.length > suffix.length : host === p;
  });
}
