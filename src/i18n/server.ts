import "server-only";
import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import { isLocale, type Locale } from "./dictionaries";

/**
 * Current locale from the root [lang] segment.
 * Unlike awaiting `params`, this doesn't touch other dynamic segments (like a
 * booking ref), so the page shell can still be prerendered.
 */
export async function getLocale(): Promise<Locale> {
  const l = await lang();
  if (!l || !isLocale(l)) notFound();
  return l;
}
