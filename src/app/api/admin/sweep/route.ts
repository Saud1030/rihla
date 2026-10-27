import { timingSafeEqual } from "node:crypto";
import { getSession } from "@/lib/auth";
import { sweep } from "@/lib/sweep";

/**
 * Run the background job now: auto-complete finished trips, rating requests, message retries.
 * POST by a signed-in owner, or GET with "Authorization: Bearer <CRON_SECRET>" (Vercel Cron sends this).
 */
function cronAllowed(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return !!secret && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export async function GET(req: Request) {
  if (!cronAllowed(req)) return new Response("Not found", { status: 404 });
  await sweep();
  return Response.json({ ok: true });
}

export async function POST(req: Request) {
  const me = await getSession();
  if (me?.role !== "owner") return new Response("Not found", { status: 404 });
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))) return new Response("Forbidden", { status: 403 });
  await sweep();
  return Response.json({ ok: true });
}
