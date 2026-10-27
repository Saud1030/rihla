import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { ChatConversation } from "@/db/schema";

export const CHAT_COOKIE = "chat_session";
export const CHAT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function findConversation(token: string | undefined) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const [c] = await db.select().from(s.chatConversations).where(eq(s.chatConversations.tokenHash, hash(token))).limit(1);
  return c ?? null;
}

export async function conversationById(id: string) {
  const [c] = await db.select().from(s.chatConversations).where(eq(s.chatConversations.id, id)).limit(1);
  return c ?? null;
}

/** New conversation; the raw token goes only into the customer's cookie */
export async function createConversation(locale: string) {
  const token = randomBytes(32).toString("hex");
  const [c] = await db.insert(s.chatConversations).values({ tokenHash: hash(token), locale }).returning();
  return { token, conversation: c };
}

export type PublicMessage = { id: number; from: "customer" | "bot" | "staff" | "system"; text: string; staff?: string | null; at: string };

export async function messagesAfter(conversationId: string, after: number): Promise<PublicMessage[]> {
  const rows = await db
    .select()
    .from(s.chatMessages)
    .where(and(eq(s.chatMessages.conversationId, conversationId), gt(s.chatMessages.id, after)))
    .orderBy(asc(s.chatMessages.id))
    .limit(200);
  // staff names stay internal; the customer sees "customer service"
  return rows.map((m) => ({ id: m.id, from: m.sender, text: m.body, at: m.createdAt.toISOString() }));
}

/** Adds a message; customer messages to staff bump the admin's unread count */
export async function addMessage(c: Pick<ChatConversation, "id">, sender: PublicMessage["from"], body: string, opts: { staffName?: string; toStaff?: boolean } = {}) {
  await db.insert(s.chatMessages).values({ conversationId: c.id, sender, body, staffName: opts.staffName ?? null });
  await db
    .update(s.chatConversations)
    .set({
      lastMessageAt: new Date(),
      ...(opts.toStaff ? { unreadAdmin: sql`${s.chatConversations.unreadAdmin} + 1` } : {}),
    })
    .where(eq(s.chatConversations.id, c.id));
}

export async function setConversation(id: string, patch: Partial<Pick<ChatConversation, "status" | "customerName" | "customerPhone" | "bookingRef" | "unreadAdmin">>) {
  await db.update(s.chatConversations).set(patch).where(eq(s.chatConversations.id, id));
}
