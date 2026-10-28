#!/usr/bin/env node
/**
 * Runs the whole site on your own computer with one command, no setup and no accounts:
 *
 *   npm run local
 *
 * - a private PostgreSQL database in the .local folder (downloaded once, nothing to install)
 * - tables, Saudi destinations, sample bookings, drivers and ratings (first run only)
 * - a test payment page (Pay / Decline, no real money) and the site on http://localhost:3000
 *
 * To share it with others for free: in VS Code open the PORTS tab, forward port 3000,
 * right-click it -> Port Visibility -> Public, and send the link. It works while this window is open.
 * Ctrl+C stops everything. Data stays in .local for next time (delete that folder to start over).
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
const LOCAL = path.join(ROOT, ".local");
const DB_DIR = path.join(LOCAL, "db");
const DB_PORT = 5434; // not 5432, so it never clashes with a PostgreSQL you may already have
const PG_PACKAGE = "embedded-postgres@17.10.0-beta.17";
const isWin = process.platform === "win32";
const say = (m) => console.log(`\n\x1b[32m==>\x1b[0m ${m}`);
const fail = (m) => {
  console.error(`\n\x1b[31m✖ ${m}\x1b[0m\n`);
  process.exit(1);
};

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 9)) fail(`Node.js 20.9 أو أحدث مطلوب (عندك ${process.versions.node}). حمّله من https://nodejs.org`);

const npm = (args) => {
  const r = spawnSync(isWin ? "npm.cmd" : "npm", args, { stdio: "inherit", shell: isWin });
  if (r.status !== 0) fail(`تعذّر تنفيذ: npm ${args.join(" ")}`);
};
const node = (args, env = {}) => {
  const r = spawnSync(process.execPath, args, { stdio: "inherit", env: { ...process.env, ...env } });
  return r.status === 0;
};
const bin = (pkg, file) => path.join(ROOT, "node_modules", pkg, file);

/* ---------- packages ---------- */
if (!fs.existsSync(bin("next", "package.json"))) {
  say("تثبيت الحزم (أول مرة فقط، دقيقة إلى ثلاث)");
  npm(["install", "--no-audit", "--no-fund"]);
}
const require = createRequire(path.join(ROOT, "package.json"));
let EmbeddedPostgres;
try {
  EmbeddedPostgres = (await import(require.resolve("embedded-postgres"))).default;
} catch {
  say("تنزيل قاعدة البيانات المحلية (أول مرة فقط)");
  npm(["install", "--no-save", "--no-audit", "--no-fund", PG_PACKAGE]);
  EmbeddedPostgres = (await import(require.resolve("embedded-postgres"))).default;
}

/* ---------- settings (.env) ---------- */
const ENV_FILE = path.join(ROOT, ".env");
const DB_URL = `postgres://postgres:postgres@localhost:${DB_PORT}/rihla`;
if (!fs.existsSync(ENV_FILE)) {
  say("إنشاء ملف الإعدادات .env");
  fs.writeFileSync(
    ENV_FILE,
    `# Written by "npm run local" for testing on this computer
DATABASE_URL=${DB_URL}
NEXT_PUBLIC_SITE_URL=http://localhost:3000
# links in messages and the payment return follow the address the site was opened on (localhost or a shared link)
SITE_URL_FROM_REQUEST=1
AUTH_SECRET=${randomBytes(32).toString("hex")}
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=Rihla-Test-2026
# test payment page (tests/mock-myfatoorah.mjs): no real money, Pay / Decline buttons
MYFATOORAH_API_KEY=test-mf-token-123
MYFATOORAH_API_BASE=http://localhost:4010
MYFATOORAH_WEBHOOK_SECRET=test-mf-webhook-secret
MOCK_PUBLIC_URL=/mock-pay
MOCK_VIA_SITE=1
# addresses allowed when you share the site from VS Code (Ports) or similar tunnels
SERVER_ACTIONS_ALLOWED_ORIGINS=**.devtunnels.ms,*.app.github.dev,*.githubpreview.dev,**.ngrok-free.app,**.trycloudflare.com
`,
  );
}
const env = Object.fromEntries(
  fs
    .readFileSync(ENV_FILE, "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
if (env.DATABASE_URL !== DB_URL)
  console.log(`\n(ملاحظة: .env يستخدم قاعدة بيانات أخرى: ${env.DATABASE_URL?.replace(/:[^:@/]+@/, ":***@")}. لاستخدام القاعدة المحلية احذف .env وأعد التشغيل.)`);
Object.assign(process.env, env);

/* ---------- database ---------- */
say("تشغيل قاعدة البيانات");
fs.mkdirSync(LOCAL, { recursive: true });
const pg = new EmbeddedPostgres({ databaseDir: DB_DIR, user: "postgres", password: "postgres", port: DB_PORT, persistent: true, onLog: () => {}, onError: () => {} });
const firstRun = !fs.existsSync(path.join(DB_DIR, "PG_VERSION"));
try {
  if (firstRun) await pg.initialise();
  await pg.start();
} catch (e) {
  fail(`تعذّر تشغيل قاعدة البيانات: ${e?.message ?? e}\nإذا كانت نافذة أخرى تشغّل الموقع أغلقها أولًا. وللبدء من جديد احذف المجلد .local`);
}
if (firstRun) await pg.createDatabase("rihla").catch(() => {});

let stopping = false;
const children = [];
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  console.log("\nإيقاف...");
  for (const c of children) c.kill();
  await pg.stop().catch(() => {});
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

say("تجهيز الجداول والبيانات الأساسية");
if (!node([bin("drizzle-kit", "bin.cjs"), "migrate"])) await shutdown(1);
const tsx = bin("tsx", "dist/cli.mjs");
if (!node([tsx, "scripts/seed.ts"])) await shutdown(1);
const demoMark = path.join(LOCAL, "demo-data-added");
if (!fs.existsSync(demoMark) && env.DATABASE_URL === DB_URL) {
  say("إضافة بيانات تجريبية: حجوزات، سائقين، تقييمات، وحساب بنكي تجريبي");
  if (node([tsx, "scripts/demo-bookings.ts"]) && node([tsx, "scripts/demo-settings.ts"])) fs.writeFileSync(demoMark, new Date().toISOString());
}

/* ---------- build (when the code changed) ---------- */
const newest = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).reduce((t, d) => {
    const p = path.join(dir, d.name);
    return Math.max(t, d.isDirectory() ? newest(p) : fs.statSync(p).mtimeMs);
  }, 0);
const built = path.join(ROOT, ".next", "BUILD_ID");
const codeTime = Math.max(newest(path.join(ROOT, "src")), fs.statSync(ENV_FILE).mtimeMs, fs.statSync(path.join(ROOT, "next.config.ts")).mtimeMs);
if (!fs.existsSync(built) || fs.statSync(built).mtimeMs < codeTime) {
  say("بناء الموقع (دقيقة إلى ثلاث)");
  if (!node([bin("next", "dist/bin/next"), "build"])) await shutdown(1);
}

/* ---------- run ---------- */
say("تشغيل الموقع");
const run = (args, name) => {
  const c = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
  const out = (d) => process.stdout.write(d.toString().replace(/^/gm, `[${name}] `));
  c.stdout.on("data", out);
  c.stderr.on("data", out);
  c.on("exit", (code) => !stopping && (console.log(`[${name}] توقف (${code})`), shutdown(1)));
  children.push(c);
};
run(["tests/mock-myfatoorah.mjs"], "payment");
run([bin("next", "dist/bin/next"), "start", "-p", "3000"], "site");

for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch("http://localhost:3000/ar")).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));
}
console.log(`
\x1b[32m✔ الموقع يعمل\x1b[0m

  الموقع:        http://localhost:3000
  لوحة التحكم:   http://localhost:3000/admin
                 ${env.ADMIN_EMAIL} / ${env.ADMIN_PASSWORD}
  حساب سائق:     0551000001 / Rihla-Driver-2026
  الدفع:         صفحة تجريبية فيها Pay و Decline (لا تُخصم أي أموال)

  لمشاركته مجانًا: في VS Code افتح تبويب PORTS ← Forward a Port ← 3000،
  ثم اضغط بالزر الأيمن ← Port Visibility ← Public، وانسخ الرابط.
  يعمل الرابط ما دام جهازك وهذه النافذة مفتوحين.

  Ctrl+C للإيقاف.
`);
