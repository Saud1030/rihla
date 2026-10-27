import type { Metadata } from "next";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { getLocale } from "@/i18n/server";
import { getDictionary, type Dictionary, type Locale } from "@/i18n/dictionaries";
import { ratingHash } from "@/lib/trip-messages";
import { formatDate } from "@/lib/format";
import { RatingForm } from "@/components/site/rating-form";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLocale();
  return { title: getDictionary(lang).rate.title, robots: { index: false } };
}

export default async function RatePage({ params }: PageProps<"/[lang]/rate/[token]">) {
  const lang = await getLocale();
  const t = getDictionary(lang);
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-3xl font-semibold">{t.rate.title}</h1>
      <p className="mt-2 text-muted">{t.rate.lead}</p>
      <Suspense fallback={<div className="mt-8 h-96 rounded-xl bg-paper border border-line" />}>
        <Rate params={params} lang={lang} t={t} />
      </Suspense>
    </div>
  );
}

async function Rate({ params, lang, t }: { params: Promise<{ token: string }>; lang: Locale; t: Dictionary }) {
  const { token } = await params;
  const valid = /^[a-f0-9]{48}$/.test(token);
  const row = valid
    ? (
        await db
          .select({ b: s.bookings, driverName: s.drivers.name, rated: s.ratings.id })
          .from(s.bookings)
          .leftJoin(s.drivers, eq(s.drivers.id, s.bookings.driverId))
          .leftJoin(s.ratings, eq(s.ratings.bookingId, s.bookings.id))
          .where(eq(s.bookings.ratingTokenHash, ratingHash(token)))
          .limit(1)
      )[0]
    : undefined;
  const box = "mt-8 rounded-xl bg-paper border border-line p-6";
  if (!row || row.b.status !== "completed") return <p className={`${box} text-danger`}>{t.rate.invalid}</p>;
  if (row.rated) return <p className={box}>{t.rate.already}</p>;
  return (
    <div className={box}>
      <dl className="mb-6 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">{t.rate.trip}</dt>
        <dd>
          <bdi>{row.b.routeTitle}</bdi>
        </dd>
        <dt className="text-muted">{t.rate.date}</dt>
        <dd>{formatDate(row.b.pickupDate, lang)}</dd>
        {row.driverName && (
          <>
            <dt className="text-muted">{t.reviews.driver}</dt>
            <dd>{row.driverName}</dd>
          </>
        )}
      </dl>
      <RatingForm token={token} t={t.rate} />
    </div>
  );
}
