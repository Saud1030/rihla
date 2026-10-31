import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { driverHold } from "./driver-hold";
import { can, type Role, type Section } from "./permissions";

export const ADMIN_COOKIE = "admin_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be set to at least 32 characters");
  return new TextEncoder().encode(secret);
}

export type AdminSession = { uid: number; email: string; name: string; role: Role; permissions: string[]; driverId: number | null };

export async function createSession(user: Pick<AdminSession, "uid" | "email" | "name">) {
  const token = await new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.uid))
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secretKey());
  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(ADMIN_COOKIE);
}

/** Read and verify the session cookie. Returns null if missing, invalid or the admin was deleted. */
export async function getSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const uid = Number(payload.sub);
    const user = await db.query.adminUsers.findFirst({ where: eq(s.adminUsers.id, uid) });
    // checked on every request, so disabling an account or changing its permissions applies at once
    if (!user || !user.active) return null;
    // a blocked or suspended driver is signed out at once
    if (user.role === "driver" && user.driverId) {
      const d = await db.query.drivers.findFirst({
        where: eq(s.drivers.id, user.driverId),
        columns: { blockedAt: true, blockReason: true, suspendedUntil: true, suspendReason: true },
      });
      if (d && driverHold(d)) return null;
    }
    return { uid: user.id, email: user.email, name: user.name, role: user.role, permissions: user.permissions ?? [], driverId: user.driverId };
  } catch {
    return null;
  }
}

/** Any signed-in account (owner, staff or driver). */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  return session;
}

/** Use at the top of every admin page and server action: the account must have this section. */
export async function requireSection(section: Section | "users"): Promise<AdminSession> {
  const session = await requireAdmin();
  if (!can(session, section)) redirect(session.role === "driver" ? "/admin/my-trips" : "/admin?denied=1");
  return session;
}

/** Driver accounts only (their own trips) */
export async function requireDriver(): Promise<AdminSession & { driverId: number }> {
  const session = await requireAdmin();
  if (session.role !== "driver" || !session.driverId) redirect("/admin");
  return session as AdminSession & { driverId: number };
}

/* Very small in-memory login throttle: 5 failed attempts per 15 minutes per key.
   Good enough for a single server; use Redis or your host's rate limiting if you scale out. */
// on globalThis so every server bundle shares one counter
const g = globalThis as unknown as { __rihlaAttempts?: Map<string, { count: number; until: number }> };
const attempts = (g.__rihlaAttempts ??= new Map());
export function loginThrottled(key: string, limit = 5) {
  const a = attempts.get(key);
  return !!a && a.count >= limit && a.until > Date.now();
}
export function recordLoginFailure(key: string) {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.until < now) attempts.set(key, { count: 1, until: now + 15 * 60_000 });
  else a.count++;
}
export function clearLoginFailures(key: string) {
  attempts.delete(key);
}
