import "server-only";
import type { Locale } from "@/i18n/dictionaries";
import { findRoute, getCatalog, getCities, getLeadHours, getLocations, getSettings, getVatConfig, getVehicles, quoteDistanceTrip, type CatalogVehicle } from "./catalog";
import { maxBookingDate, todayInRiyadh } from "./booking";
import { getFaqs } from "./chatbot";
import { fillTokens, pickLang } from "./chat-match";
import { cityHourlyPrices } from "./hourly";
import { earliestPickup, farEnough } from "./lead-time";
import { cleanDays, HOUR_PACKAGES, isHourPackage } from "./policy";
import { adjustPrice } from "./price-rules";
import { getPriceRules } from "./price-rules-server";
import { displayPrice } from "./pricing";
import { isClock, isDay } from "./timespan";

/**
 * The voice assistant's brain. The browser turns the customer's speech into text and sends it here;
 * Claude answers from the site's own data (destinations, cars, prices, policies) through the tools below,
 * and can prepare a booking: it never books or pays, it only opens the booking page already filled in,
 * so the customer reviews the details and confirms by hand.
 *
 * Needs ANTHROPIC_API_KEY (Claude Console). Without it the assistant is hidden from the site.
 */

const API_BASE = (process.env.ANTHROPIC_API_BASE || "https://api.anthropic.com").replace(/\/$/, "");
const MODEL = process.env.VOICE_MODEL || "claude-haiku-5-5";
/** a spoken answer is short; this also caps the cost of one reply */
const MAX_TOKENS = 500;
/** tool rounds per customer message */
const MAX_STEPS = 5;

export const isVoiceEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY) && process.env.VOICE_ASSISTANT !== "0";

export type VoiceTurn = { role: "user" | "assistant"; text: string };
export type VoiceReply = { text: string; navigate: string | null };

/** Pages the assistant may open for the customer */
const PAGES = {
  home: "",
  routes: "/routes",
  fleet: "/fleet",
  my_booking: "/booking",
  contact: "/contact",
  packages: "/packages",
  terms: "/terms",
  join_as_driver: "/drivers/join",
} as const;
type PageKey = keyof typeof PAGES;

const TOOLS = [
  {
    name: "get_prices",
    description:
      "Prices of every available car for a transfer between two places, with distance and trip time. Call it before quoting any price or saying whether cars are available for a trip. Prices are in Saudi riyals.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "slug of the pickup place, from the list of places" },
        to: { type: "string", description: "slug of the drop-off place, from the list of places" },
        date: { type: "string", description: "trip date YYYY-MM-DD if the customer gave one (seasonal prices and offers depend on it)" },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "get_hourly_prices",
    description: "Prices of a car with a driver by the hour or by the day inside one city, for every available car. 24 hours is a full day and can be repeated for several days.",
    input_schema: {
      type: "object",
      properties: {
        city: { type: "string", description: "slug of the city, from the list of cities" },
        hours: { type: "integer", enum: [...HOUR_PACKAGES], description: "package length in hours; 24 = a full day" },
        days: { type: "integer", description: "number of days, only with hours = 24 (default 1)" },
      },
      required: ["city", "hours"],
    },
  },
  {
    name: "open_booking",
    description:
      "Opens the booking page filled in with the trip, so the customer picks the car, reviews and confirms. Call it only when the customer asked to book and you know everything needed: for a transfer the pickup place, drop-off place, date and time; for hourly the city, hours, date and time. Ask for whatever is missing first.",
    input_schema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["transfer", "hourly"] },
        from: { type: "string", description: "transfer: slug of the pickup place" },
        to: { type: "string", description: "transfer: slug of the drop-off place" },
        city: { type: "string", description: "hourly: slug of the city" },
        hours: { type: "integer", enum: [...HOUR_PACKAGES], description: "hourly: package length" },
        days: { type: "integer", description: "hourly with 24 hours: number of days" },
        date: { type: "string", description: "pickup date YYYY-MM-DD" },
        time: { type: "string", description: "pickup time HH:MM in 24-hour clock, Saudi time" },
      },
      required: ["mode", "date", "time"],
    },
  },
  {
    name: "open_page",
    description: "Takes the customer to a page of the site when they ask to see it (all routes and prices, the cars, tracking or cancelling their booking, contact details, packages, terms, driver sign-up).",
    input_schema: {
      type: "object",
      properties: { page: { type: "string", enum: Object.keys(PAGES) } },
      required: ["page"],
    },
  },
];

const sar = (halalas: number) => Math.round(halalas) / 100;
const str = (v: unknown, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function carLine(v: CatalogVehicle, price: number, lang: Locale) {
  return { car: lang === "ar" ? v.nameAr : v.nameEn, type: v.category, passengers: v.passengers, bags: v.bags, price_sar: sar(price) };
}

/** pickup time on the form's quarter-hour steps */
function toSlot(time: string) {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(23 * 60 + 45, Math.round((h * 60 + m) / 15) * 15);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

async function getPrices(input: Record<string, unknown>, lang: Locale) {
  const from = str(input.from);
  const to = str(input.to);
  const date = isDay(input.date) ? input.date : "";
  const [catalog, vat, rules] = await Promise.all([getCatalog(), getVatConfig(), getPriceRules()]);
  const final = (price: number) => displayPrice(date ? adjustPrice(price, date, rules).price : price, vat);
  const note = {
    prices_include_vat: vat.inclusiveDisplay,
    vat_percent: vat.rateBp / 100,
    priced_for_date: date || "no date given: the price can change with seasons and offers once a date is chosen",
  };

  const fixed = findRoute(catalog, from, to);
  if (fixed) {
    return {
      pricing: "fixed price",
      distance_km: fixed.route.distanceKm,
      trip_minutes: fixed.route.durationMin,
      cars: fixed.route.trips.map((t) => carLine(t.vehicle, final(t.price), lang)),
      ...note,
    };
  }
  const quote = await quoteDistanceTrip(from, to);
  if (!quote || !quote.options.length) return { error: "No price for this trip on the site. Check both slugs are from the list; if they are, offer WhatsApp so staff can quote it." };
  return {
    pricing: "estimated by distance",
    distance_km: Math.round(quote.km),
    trip_minutes: quote.minutes,
    cars: quote.options.map((o) => carLine(o.vehicle, final(o.price), lang)),
    ...note,
  };
}

async function getHourlyPrices(input: Record<string, unknown>, lang: Locale) {
  const city = str(input.city);
  const hours = Number(input.hours);
  const [settings, cities, vehicles, vat] = await Promise.all([getSettings(), getCities(), getVehicles(), getVatConfig()]);
  if (settings.hourly_enabled === "0") return { error: "Booking by the hour is switched off on the site right now." };
  if (!cities.some((c) => c.slug === city)) return { error: "Unknown city slug. Use a slug from the list of cities." };
  if (!isHourPackage(hours)) return { error: `Hours must be one of ${HOUR_PACKAGES.join(", ")}.` };
  const days = hours === 24 ? cleanDays(input.days) : 1;
  const prices = await cityHourlyPrices(city, hours, vehicles);
  return {
    hours,
    days,
    cars: vehicles.map((v) => carLine(v, displayPrice((prices.get(v.id) ?? 0) * days, vat), lang)),
    prices_include_vat: vat.inclusiveDisplay,
    vat_percent: vat.rateBp / 100,
  };
}

async function openBooking(input: Record<string, unknown>, lang: Locale): Promise<{ result: Record<string, unknown>; navigate?: string }> {
  const date = input.date;
  const rawTime = input.time;
  if (!isDay(date) || date < todayInRiyadh() || date > maxBookingDate()) return { result: { error: "The date is missing, in the past, or more than a year ahead. Ask the customer for the date." } };
  if (!isClock(rawTime)) return { result: { error: "The time is missing or not HH:MM. Ask the customer for the time." } };
  const time = toSlot(rawTime);
  const earliest = earliestPickup(await getLeadHours());
  if (!farEnough(date, time, earliest)) {
    return { result: { error: `Too soon. The earliest pickup that can be booked now is ${earliest.date} at ${earliest.time}. Tell the customer and ask for a later time.` } };
  }

  const q = new URLSearchParams();
  if (input.mode === "hourly") {
    const city = str(input.city);
    const hours = Number(input.hours);
    const [settings, cities] = await Promise.all([getSettings(), getCities()]);
    if (settings.hourly_enabled === "0") return { result: { error: "Booking by the hour is switched off on the site right now." } };
    if (!cities.some((c) => c.slug === city)) return { result: { error: "Unknown city slug. Use a slug from the list of cities." } };
    if (!isHourPackage(hours)) return { result: { error: `Hours must be one of ${HOUR_PACKAGES.join(", ")}. Ask the customer which one.` } };
    q.set("mode", "hourly");
    q.set("city", city);
    q.set("hours", String(hours));
    if (hours === 24 && cleanDays(input.days) > 1) q.set("days", String(cleanDays(input.days)));
  } else {
    const from = str(input.from);
    const to = str(input.to);
    const locations = await getLocations();
    if (!locations.some((l) => l.slug === from) || !locations.some((l) => l.slug === to)) return { result: { error: "Unknown place slug. Use slugs from the list of places, or ask the customer which place they mean." } };
    if (from === to) return { result: { error: "Pickup and drop-off are the same place. Ask the customer where they are going." } };
    if (!findRoute(await getCatalog(), from, to) && !(await quoteDistanceTrip(from, to))?.options.length) {
      return { result: { error: "This trip has no price on the site. Offer WhatsApp so staff can arrange it." } };
    }
    q.set("from", from);
    q.set("to", to);
  }
  q.set("date", date);
  q.set("time", time);
  return {
    result: { ok: true, opened: "the booking page, filled in", date, time, next: "Tell the customer in one short sentence that the booking page is open: they choose the car, enter their details and confirm." },
    // the search route picks the right booking page and carries the date and time into the form
    navigate: `/${lang}/search?${q}`,
  };
}

async function runTool(name: string, input: Record<string, unknown>, lang: Locale): Promise<{ result: Record<string, unknown>; navigate?: string }> {
  try {
    switch (name) {
      case "get_prices":
        return { result: await getPrices(input, lang) };
      case "get_hourly_prices":
        return { result: await getHourlyPrices(input, lang) };
      case "open_booking":
        return await openBooking(input, lang);
      case "open_page": {
        const page = str(input.page) as PageKey;
        if (!(page in PAGES)) return { result: { error: "Unknown page." } };
        return { result: { ok: true, opened: page }, navigate: `/${lang}${PAGES[page]}` };
      }
      default:
        return { result: { error: "Unknown tool." } };
    }
  } catch (e) {
    console.error("voice tool failed", name, e);
    return { result: { error: "The site could not answer this right now. Apologise briefly and offer WhatsApp." } };
  }
}

/** What the assistant knows about the site: places, cities, cars, policies. Changes rarely, so it is sent as a cached block. */
async function siteKnowledge(lang: Locale) {
  const [locations, cities, vehicles, settings, faqs, leadHours] = await Promise.all([getLocations(), getCities(), getVehicles(), getSettings(), getFaqs(), getLeadHours()]);
  const cityBySlug = new Map(cities.map((c) => [c.slug, c]));
  const places = locations
    .filter((l) => cityBySlug.has(l.city))
    .map((l) => `${l.slug} | ${l.nameAr} | ${l.nameEn} | ${l.kind} | ${cityBySlug.get(l.city)?.nameAr}`)
    .join("\n");
  const cityLines = cities.map((c) => `${c.slug} | ${c.nameAr} | ${c.nameEn}`).join("\n");
  const cars = vehicles.map((v) => `${v.nameAr} / ${v.nameEn} (${v.category}): ${v.passengers} passengers, ${v.bags} bags`).join("\n");
  const answers = faqs
    .map((f) => `Q: ${pickLang(f.questionAr, f.questionEn, lang)}\nA: ${fillTokens(pickLang(f.answerAr, f.answerEn, lang), settings, lang)}`)
    .join("\n\n");
  const company = pickLang(settings.company_name_ar, settings.company_name_en, lang);

  return `You are the voice assistant of ${company || "a Saudi car booking service"}: private cars with drivers for transfers between places (airports, hotels, cities, holy sites) and cars with a driver by the hour or by the day. Customers talk to you out loud on the website and hear your answer read aloud.

How to talk
- Your words are spoken by a text-to-speech voice. Write plain sentences only: no lists, no symbols, no markdown, no emoji, no links.
- Keep it short: one to three sentences. When several cars are available, name the cheapest and at most two more, then offer the rest.
- Say prices as a number followed by "ريال" in Arabic or "riyals" in English.
- ${lang === "ar" ? "Reply in friendly, simple Saudi Arabic. If the customer speaks English, reply in English." : "Reply in friendly, simple English. If the customer speaks Arabic, reply in Arabic."}
- The customer's words come from speech recognition and may be misheard. If a place or a time is unclear, ask a short question instead of guessing.

What you can do
- Answer questions about places served, cars, prices, booking, payment and cancellation, using the tools and the information below. Never invent a price, a place or a policy: prices come only from get_prices and get_hourly_prices.
- Prepare a booking with open_booking. You do not book or take payment yourself: you open the booking page filled in, and the customer chooses the car, enters their details and confirms there. Never ask for card numbers or personal details.
- Collect what a booking needs one question at a time: from where, to where, which day, what time. For a car by the hour or by the day: which city, how long (${HOUR_PACKAGES.join(", ")} hours; 24 is a full day), which day, what time.
- Open a page of the site with open_page when asked.
- A booking must be made at least ${leadHours} hours before pickup.
- For anything else about a booking that already exists (changes, problems, refunds), send the customer to the "my booking" page or to WhatsApp${settings.whatsapp ? ` on +${settings.whatsapp.replace(/[^\d]/g, "")}` : ""}.
- Stay on this service. For unrelated requests, say kindly that you only help with trips and bookings here.

Places (slug | Arabic name | English name | kind | city). Use the slug in tools, say the name to the customer:
${places}

Cities for cars by the hour or day (slug | Arabic | English):
${cityLines}

Cars:
${cars}

Answers the company gives to common questions:
${answers || "(none written yet)"}`;
}

function clock(lang: Locale) {
  const now = new Date();
  const today = todayInRiyadh(now);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", weekday: "long" }).format(now);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  return `Now in Saudi Arabia: ${weekday} ${today}, ${time}. Work out dates like "tomorrow" or "next Friday" from this. When the customer says a time without morning or evening and it is unclear, ask which. Site language: ${lang}.`;
}

type Block = { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> };
type ApiMessage = { role: "user" | "assistant"; content: string | Record<string, unknown>[] };

async function callClaude(system: Record<string, unknown>[], messages: ApiMessage[]) {
  const res = await fetch(`${API_BASE}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system, tools: TOOLS, messages }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as { content: Block[]; stop_reason: string };
}

/** One customer message in, one spoken answer out (and maybe a page to open) */
export async function voiceReply(history: VoiceTurn[], lang: Locale): Promise<VoiceReply> {
  const system = [
    { type: "text", text: await siteKnowledge(lang), cache_control: { type: "ephemeral" } },
    { type: "text", text: clock(lang) },
  ];
  const messages: ApiMessage[] = history.map((t) => ({ role: t.role, content: t.text }));
  let navigate: string | null = null;

  for (let step = 0; step < MAX_STEPS; step++) {
    const out = await callClaude(system, messages);
    const calls = out.content.filter((b) => b.type === "tool_use");
    if (out.stop_reason !== "tool_use" || !calls.length) {
      const text = out.content
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join(" ")
        .trim();
      return { text, navigate };
    }
    messages.push({ role: "assistant", content: out.content as Record<string, unknown>[] });
    const results: Record<string, unknown>[] = [];
    for (const c of calls) {
      const r = await runTool(c.name ?? "", c.input ?? {}, lang);
      if (r.navigate) navigate = r.navigate;
      results.push({ type: "tool_result", tool_use_id: c.id, content: JSON.stringify(r.result) });
    }
    messages.push({ role: "user", content: results });
  }
  return { text: "", navigate };
}
