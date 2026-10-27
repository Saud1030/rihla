import type { Metadata } from "next";
import { getLocale } from "@/i18n/server";
import { Suspense } from "react";
import { getDictionary, type Locale } from "@/i18n/dictionaries";
import { getSettings } from "@/lib/catalog";
import { formatNumber } from "@/lib/format";
import { parseCancelPolicy } from "@/lib/policy";

/* Starter terms. Review them with your lawyer and edit to match how you operate. */
const TERMS = {
  ar: [
    ["الأسعار", "الأسعار المعروضة للسيارة كاملة وتشمل الوقود ورسوم الطرق، ولا تشمل مواسم رمضان والحج ما لم يُذكر خلاف ذلك."],
    ["الانتظار", "يشمل السعر ٦٠ دقيقة انتظار مجانية في المطارات و١٥ دقيقة في الفنادق. بعد ذلك قد تُحتسب رسوم انتظار يُتفق عليها مسبقًا."],
    ["الإلغاء والاسترداد", "{cancel}"],
    ["تغيير الموعد", "يمكن تغيير موعد الرحلة مجانًا مرة واحدة قبل الموعد بـ١٢ ساعة على الأقل عبر واتساب."],
    ["الحجز بالساعة", "تبدأ المدة من وقت الاستلام المحدد في الحجز، والسائق معك طوال المدة. الوقت الإضافي يُتفق عليه مع السائق ويُدفع له مباشرة."],
    ["الركاب والحقائب", "لا يجوز تجاوز عدد الركاب والحقائب المسموح به للسيارة المختارة. يحق للسائق رفض الحمولة الزائدة."],
    ["الدفع", "يتم الدفع عبر ماي فاتورة أو بالتحويل البنكي. الحجز بالتحويل البنكي يُؤكَّد بعد وصول المبلغ إلى حسابنا، واسترداده يكون بتحويل بنكي إلى حسابك. لا نحتفظ ببيانات البطاقات."],
  ],
  en: [
    ["Prices", "Prices are per vehicle and include fuel and road fees. They do not apply during Ramadan and Hajj unless stated."],
    ["Waiting time", "60 minutes of free waiting at airports and 15 minutes at hotels are included. Extra waiting may be charged at a rate agreed in advance."],
    ["Cancellation and refunds", "{cancel}"],
    ["Changing your booking", "You can move your pickup time once for free, at least 12 hours ahead, by messaging us on WhatsApp."],
    ["Hourly bookings", "The time starts at the pickup time in your booking, and the driver stays with you throughout. Extra time is agreed with and paid to the driver."],
    ["Passengers and luggage", "The number of passengers and bags may not exceed the selected vehicle's capacity. Drivers may refuse extra load."],
    ["Payment", "You can pay through MyFatoorah or by bank transfer. A bank-transfer booking is confirmed once the money reaches our account, and its refund is sent back by bank transfer. We do not store card details."],
  ],
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLocale();
  return { title: getDictionary(lang).terms.title };
}

export default async function TermsPage() {
  const lang = await getLocale();
  const t = getDictionary(lang);
  return (
    <article className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl md:text-4xl font-semibold">{t.terms.title}</h1>
      <Suspense fallback={null}>
        <Terms lang={lang} />
      </Suspense>
    </article>
  );
}

/** The cancellation paragraph follows the policy set in Admin -> Settings */
async function Terms({ lang }: { lang: Locale }) {
  const p = parseCancelPolicy(await getSettings());
  const n = (x: number) => formatNumber(x, lang);
  const cancel = !p.enabled
    ? lang === "ar"
      ? "لإلغاء الحجز تواصل معنا على واتساب. لا يُسترد المبلغ عند عدم الحضور."
      : "To cancel, message us on WhatsApp. No refund for no-shows."
    : lang === "ar"
      ? `يمكنك إلغاء حجزك من صفحة الحجز حتى موعد الاستلام. يُسترد المبلغ كاملًا عند الإلغاء قبل الموعد بـ${n(p.fullHours)} ساعة على الأقل، ويُسترد ${n(p.partialPercent)}٪ عند الإلغاء خلال أقل من ذلك. لا يُسترد المبلغ عند عدم الحضور. يعود المبلغ إلى البطاقة المستخدمة في الدفع.`
      : `You can cancel from your booking page until pickup time. Full refund when you cancel at least ${n(p.fullHours)} hours before pickup; ${n(p.partialPercent)}% refund when cancelling later. No refund for no-shows. Refunds go back to the card you paid with.`;
  return (
    <div className="mt-8 space-y-7">
      {TERMS[lang].map(([h, para]) => (
        <section key={h}>
          <h2 className="text-lg font-semibold">{h}</h2>
          <p className="mt-1 text-muted">{para === "{cancel}" ? cancel : para}</p>
        </section>
      ))}
    </div>
  );
}
