/** Starts the background job (auto-complete finished trips, rating requests, message retries) on the Node.js server */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DISABLE_SWEEP === "1") return;
  const g = globalThis as unknown as { __rihlaSweep?: NodeJS.Timeout };
  if (g.__rihlaSweep) return;
  const { sweep } = await import("./lib/sweep");
  const run = () => sweep().catch((e) => console.error("background sweep failed", e));
  g.__rihlaSweep = setInterval(run, 5 * 60_000);
  setTimeout(run, 30_000);
}
