import { cookies, headers } from "next/headers";
import { isLocale, type Locale } from "@/i18n/dictionaries";
import { answerFor, getChatConfig, matchQuestion } from "@/lib/chatbot";
import { addMessage, conversationById, CHAT_COOKIE, CHAT_COOKIE_MAX_AGE, createConversation, findConversation, messagesAfter, setConversation } from "@/lib/chat";
import { allow, clientIp } from "@/lib/rate-limit";
import { extraAllowedHosts, hostAllowed } from "@/lib/http";

/**
 * The chat widget's only endpoint.
 *  GET  ?after=<last message id>  -> new messages and the conversation status (polled while open)
 *  POST { type: "ask", text } | { type: "faq", id } | { type: "staff", name, phone, ref? }
 * The conversation is found by a random secret in an httpOnly cookie; the database keeps only its hash.
 */

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

async function current() {
  return findConversation((await cookies()).get(CHAT_COOKIE)?.value);
}

export async function GET(req: Request) {
  const ip = clientIp(await headers());
  if (!allow(`chat-get:${ip}`, 400, 10 * 60_000)) return json({ error: "throttled" }, 429);
  const c = await current();
  if (!c) return json({ status: null, messages: [] });
  const after = Math.max(0, Number(new URL(req.url).searchParams.get("after")) || 0);
  return json({ status: c.status, messages: await messagesAfter(c.id, after) });
}

const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);

export async function POST(req: Request) {
  const h = await headers();
  // only our own pages may post (the cookie is SameSite=Lax as well)
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (origin && host) {
    let oh = "";
    try {
      oh = new URL(origin).host;
    } catch {}
    if (oh !== host && !hostAllowed(oh, extraAllowedHosts())) return json({ error: "origin" }, 403);
  }

  const ip = clientIp(h);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const lang: Locale = isLocale(String(body.lang)) ? (String(body.lang) as Locale) : "ar";
  const config = await getChatConfig(lang);
  if (!config.enabled) return json({ error: "disabled" }, 403);
  const after = Math.max(0, Number(body.after) || 0);

  let c = await current();
  if (!c) {
    if (!allow(`chat-new:${ip}`, 15, 60 * 60_000)) return json({ error: "throttled" }, 429);
    const created = await createConversation(lang);
    c = created.conversation;
    (await cookies()).set(CHAT_COOKIE, created.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: CHAT_COOKIE_MAX_AGE,
    });
  }
  if (!allow(`chat-post:${c.id}`, 30, 5 * 60_000) || !allow(`chat-post-ip:${ip}`, 120, 10 * 60_000)) return json({ error: "throttled" }, 429);

  const withStaff = c.status === "waiting" || c.status === "open";
  switch (body.type) {
    case "faq": {
      const a = await answerFor(Number(body.id), lang);
      if (!a) return json({ error: "bad_request" }, 400);
      await addMessage(c, "customer", a.question, { toStaff: withStaff });
      if (!withStaff) await addMessage(c, "bot", a.answer);
      break;
    }
    case "ask": {
      const text = clean(body.text, 1000);
      if (!text) return json({ error: "empty" }, 400);
      await addMessage(c, "customer", text, { toStaff: withStaff });
      // while a staff member handles the conversation the bot stays quiet
      if (!withStaff) {
        if (c.status === "closed") await setConversation(c.id, { status: "bot" });
        await addMessage(c, "bot", (await matchQuestion(text, lang)) ?? config.fallback);
      }
      break;
    }
    case "staff": {
      if (config.handoff !== "live" && config.handoff !== "both") return json({ error: "disabled" }, 403);
      const name = clean(body.name, 80);
      const phone = clean(body.phone, 30);
      const digits = phone.replace(/[^\d٠-٩]/g, "");
      const ref = clean(body.ref, 12).toUpperCase();
      const errors: string[] = [];
      if (name.length < 2) errors.push("name");
      if (digits.length < 8 || digits.length > 15) errors.push("phone");
      if (ref && !/^[A-Z0-9]{8}$/.test(ref)) errors.push("ref");
      if (errors.length) return json({ error: "invalid", fields: errors }, 400);
      if (!withStaff) {
        await setConversation(c.id, { status: "waiting", customerName: name, customerPhone: phone, bookingRef: ref || null });
        await addMessage(c, "system", config.waiting, { toStaff: true });
      }
      break;
    }
    default:
      return json({ error: "bad_request" }, 400);
  }
  const fresh = (await conversationById(c.id)) ?? c;
  return json({ status: fresh.status, messages: await messagesAfter(c.id, after) });
}
