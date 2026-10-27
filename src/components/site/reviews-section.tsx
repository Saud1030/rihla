import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { getPublicReviews } from "@/lib/reviews";
import { formatNumber } from "@/lib/format";
import { Stars } from "./stars";

/** "What our customers say": average, how the stars are spread, and the latest comments */
export async function ReviewsSection({ lang, t }: { lang: Locale; t: Dictionary }) {
  const data = await getPublicReviews();
  if (!data) return null;
  const max = Math.max(...data.dist.map((d) => d.n), 1);
  const month = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { month: "long", year: "numeric", timeZone: "Asia/Riyadh" });
  return (
    <section className="mx-auto max-w-6xl px-4 pt-16" aria-labelledby="reviews-title" data-testid="reviews">
      <h2 id="reviews-title" className="text-2xl md:text-3xl font-semibold mb-6">
        {t.reviews.title}
      </h2>
      <div className="grid gap-6 lg:grid-cols-[280px_1fr] items-start">
        <div className="rounded-xl border border-line bg-paper p-6">
          <p className="flex items-baseline gap-2">
            <span className="font-display text-5xl font-semibold tabular" data-testid="reviews-avg">
              {formatNumber(data.avg, lang, 1)}
            </span>
            <span className="text-muted">{t.reviews.outOf}</span>
          </p>
          <div className="mt-2">
            <Stars value={data.avg} size="lg" />
          </div>
          <p className="mt-1 text-sm text-muted">{t.reviews.based.replace("{n}", formatNumber(data.count, lang))}</p>
          <ul className="mt-5 space-y-1.5" aria-hidden>
            {data.dist.map((d) => (
              <li key={d.stars} className="flex items-center gap-2 text-sm">
                <span className="w-3 tabular text-muted">{formatNumber(d.stars, lang)}</span>
                <span className="text-amber">★</span>
                <span className="h-2 flex-1 rounded-full bg-stone overflow-hidden">
                  <span className="block h-full rounded-full bg-amber" style={{ width: `${(d.n / max) * 100}%` }} />
                </span>
                <span className="w-6 text-end tabular text-muted">{formatNumber(d.n, lang)}</span>
              </li>
            ))}
          </ul>
        </div>
        {data.reviews.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.reviews.slice(0, 6).map((r) => (
              <li key={r.id} className="flex flex-col rounded-xl border border-line bg-paper p-5">
                <Stars value={r.stars} size="sm" />
                <blockquote dir="auto" className="mt-3 flex-1 text-[15px] leading-relaxed line-clamp-6 text-start">
                  {r.comment}
                </blockquote>
                <p className="mt-4 flex items-center gap-2 text-sm">
                  <span className="grid place-items-center size-8 rounded-full bg-sign-soft text-sign font-semibold" aria-hidden>
                    {r.name.charAt(0) || "؟"}
                  </span>
                  <span className="font-medium" dir="auto">
                    {r.name || t.reviews.customer}
                  </span>
                  <span className="text-muted ms-auto text-xs">{month.format(new Date(r.at))}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
