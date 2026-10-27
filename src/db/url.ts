/**
 * The database address. Usually DATABASE_URL; hosts name it differently:
 * Vercel + Neon adds DATABASE_URL (or <PREFIX>_DATABASE_URL when a prefix was chosen), Vercel Postgres adds POSTGRES_URL.
 * `direct` prefers the non-pooled address, which migrations need.
 */
export function databaseUrl({ direct = false } = {}): string | undefined {
  const e = process.env;
  const named = (suffix: string) => Object.keys(e).find((k) => k.endsWith(suffix) && e[k]);
  const pick = (...keys: (string | undefined)[]) => keys.map((k) => (k ? e[k] : undefined)).find((v) => v && /^postgres(ql)?:\/\//.test(v));
  return direct
    ? pick("DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING", named("_DATABASE_URL_UNPOOLED"), "DATABASE_URL", named("_DATABASE_URL"), "POSTGRES_URL")
    : pick("DATABASE_URL", named("_DATABASE_URL"), "POSTGRES_URL", named("_POSTGRES_URL"), "DATABASE_URL_UNPOOLED");
}

export function requireDatabaseUrl(opts?: { direct?: boolean }): string {
  const url = databaseUrl(opts);
  if (!url)
    throw new Error(
      "No database address found (DATABASE_URL is not set). On Vercel: project -> Storage -> create a Neon database and press Connect, then Redeploy. " +
        "لا يوجد رابط قاعدة البيانات: في Vercel افتح Storage وأنشئ قاعدة Neon واضغط Connect، ثم أعد النشر (Redeploy).",
    );
  return url;
}
