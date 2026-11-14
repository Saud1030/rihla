import { headers } from "next/headers";
import { isLocale, type Locale } from "@/i18n/dictionaries";
import { extraAllowedHosts, hostAllowed } from "@/lib/http";
import { allow, clientIp } from "@/lib/rate-limit";
import { isVoiceEnabled, voiceReply, type VoiceTurn } from "@/lib/voice-agent";

/**
 * The voice assistant's only endpoint.
 *  POST { lang, turns: [{ role: "user" | "assistant", text }] }  ->  { text, navigate }
 * The browser keeps the short conversation and sends it each time; nothing is stored here.
 * Every call costs a little (Claude API), so it is limited per visitor.
 */

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

const MAX_TURNS = 16;
const MAX_CHARS = 600;

const clean = (v: unknown) =>
  String(v ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, MAX_CHARS);

export async function POST(req: Request) {
  if (!isVoiceEnabled()) return json({ error: "disabled" }, 403);

  const h = await headers();
  // only our own pages may post
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
  if (!allow(`voice:${ip}`, 20, 5 * 60_000) || !allow(`voice-day:${ip}`, 150, 24 * 3600_000)) return json({ error: "throttled" }, 429);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const lang: Locale = isLocale(String(body.lang)) ? (String(body.lang) as Locale) : "ar";

  const turns: VoiceTurn[] = [];
  for (const t of Array.isArray(body.turns) ? body.turns.slice(-MAX_TURNS) : []) {
    const role = (t as VoiceTurn)?.role;
    const text = clean((t as VoiceTurn)?.text);
    if ((role !== "user" && role !== "assistant") || !text) continue;
    // the API wants turns to alternate: join two in a row from the same side
    const prev = turns[turns.length - 1];
    if (prev?.role === role) prev.text = `${prev.text}\n${text}`.slice(0, MAX_CHARS * 2);
    else turns.push({ role, text });
  }
  while (turns.length && turns[0].role !== "user") turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== "user") return json({ error: "empty" }, 400);

  try {
    const reply = await voiceReply(turns, lang);
    if (!reply.text && !reply.navigate) return json({ error: "failed" }, 502);
    return json(reply);
  } catch (e) {
    console.error("voice assistant failed", e);
    return json({ error: "failed" }, 502);
  }
}
