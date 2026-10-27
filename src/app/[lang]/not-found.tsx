import Link from "next/link";
import { getLocale } from "@/i18n/server";

export default async function NotFound() {
  const lang = await getLocale();
  const ar = lang === "ar";
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <div className="sign inline-block px-8 py-5 font-display text-4xl font-semibold tabular" dir="ltr">404</div>
      <h1 className="mt-8 text-2xl font-semibold">{ar ? "لم نجد هذه الصفحة" : "We couldn't find this page"}</h1>
      <p className="mt-2 text-muted">
        {ar ? "ربما تغيّر الرابط أو أن رقم الحجز غير صحيح." : "The link may have changed, or the booking number is wrong."}
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href={`/${lang}/routes`} className="btn btn-primary">{ar ? "الرحلات والأسعار" : "Routes & prices"}</Link>
        <Link href={`/${lang}/booking`} className="btn btn-ghost">{ar ? "ابحث عن حجزك" : "Find your booking"}</Link>
      </div>
    </div>
  );
}
