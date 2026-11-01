import type { NextRequest } from "next/server";
import { seeOther } from "@/lib/http";
import { isLocale } from "@/i18n/dictionaries";
import { findRoute, getCatalog, getLocations, getSettings } from "@/lib/catalog";
import { isHourPackage } from "@/lib/policy";
import { isClock, isDay } from "@/lib/timespan";
import { parseStops } from "@/lib/multi";

/**
 * Search from the green sign (home page and routes page):
 *  transfer: a fixed-price route between the two places -> that route's page,
 *            otherwise the distance-priced trip page
 *  multi:    a trip through several stops -> the multi-stop page
 *  hourly:   the hourly booking page for the pickup point, destination and package
 * Date and time are carried along so the booking form opens already filled in.
 * Anything incomplete goes back to the chooser.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/[lang]/search">) {
  const { lang } = await ctx.params;
  const locale = isLocale(lang) ? lang : "ar";
  const q = req.nextUrl.searchParams;
  const from = (q.get("from") ?? "").slice(0, 80);
  const to = (q.get("to") ?? "").slice(0, 80);
  const date = q.get("date");
  const time = q.get("time");

  const back = () => seeOther(`/${locale}`, undefined, "search");
  const go = (path: string, params: Record<string, string>) => {
    const out = new URLSearchParams(params);
    if (isDay(date)) out.set("date", date);
    if (isClock(time)) out.set("time", time);
    return seeOther(path, out);
  };

  // several stops: start + 2..5 destinations, priced leg by leg
  if (q.get("mode") === "multi") {
    const stops = parseStops([from, ...(q.get("stops") ?? "").split(",")].filter(Boolean).join(","));
    if (!stops) return back();
    // dates and times of stops 3+ (t3=2026-11-03T10:00 ...)
    const at: Record<string, string> = {};
    for (let k = 3; k < stops.length; k++) {
      const v = q.get(`t${k}`) ?? "";
      if (/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(v)) at[`t${k}`] = v;
    }
    return go(`/${locale}/multi`, { stops: stops.join(","), ...at });
  }

  const locations = await getLocations();
  const fromLoc = locations.find((l) => l.slug === from);
  if (!fromLoc) return back();

  if (q.get("mode") === "hourly") {
    const hours = Number(q.get("hours"));
    const dest = locations.find((l) => l.slug === to);
    if (dest && dest.slug !== fromLoc.slug && isHourPackage(hours) && (await getSettings()).hourly_enabled !== "0") {
      return go(`/${locale}/hourly`, { from: fromLoc.slug, to: dest.slug, hours: String(hours) });
    }
    return back();
  }

  const match = findRoute(await getCatalog(), from, to || undefined);
  if (match) return go(`/${locale}/routes/${match.route.slug}`, match.reversed ? { dir: "rev" } : {});

  const toLoc = locations.find((l) => l.slug === to);
  // the trip page prices it by distance, or explains that it can't and offers WhatsApp
  if (toLoc && toLoc.slug !== fromLoc.slug) return go(`/${locale}/trip`, { from: fromLoc.slug, to: toLoc.slug });
  return back();
}
