import type { NextRequest } from "next/server";
import { seeOther } from "@/lib/http";
import { isLocale } from "@/i18n/dictionaries";
import { findRoute, getCatalog, getLocations, getSettings } from "@/lib/catalog";
import { isHourPackage } from "@/lib/policy";
import { isClock, isDay } from "@/lib/timespan";

/**
 * Search from the green sign (home page and routes page):
 *  transfer: a fixed-price route between the two places -> that route's page,
 *            otherwise the distance-priced trip page
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
