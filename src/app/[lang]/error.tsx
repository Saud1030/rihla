"use client"; // error boundaries must be client components

import { useParams } from "next/navigation";

/** Shown instead of Next's bare error page when something fails while loading a page or saving a form */
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  const ar = useParams<{ lang?: string }>()?.lang !== "en";
  const digest = (error as { digest?: string } | null)?.digest;
  return (
    <main dir={ar ? "rtl" : "ltr"} className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">{ar ? "تعذّر إكمال الطلب" : "Something went wrong"}</h1>
      <p className="text-ink/70">
        {ar
          ? "حدث خطأ مؤقت في الخادم. حاول مرة أخرى، وإذا تكرر تواصل معنا."
          : "A temporary server error occurred. Please try again, and contact us if it keeps happening."}
      </p>
      <div className="flex gap-3">
        <button type="button" onClick={() => retry()} className="rounded-lg bg-ink px-5 py-2 font-semibold text-paper">
          {ar ? "حاول مرة أخرى" : "Try again"}
        </button>
        <a href={ar ? "/ar/contact" : "/en/contact"} className="rounded-lg border border-ink/20 px-5 py-2 font-semibold">
          {ar ? "تواصل معنا" : "Contact us"}
        </a>
      </div>
      {digest && <p className="font-mono text-xs text-ink/40">{digest}</p>}
    </main>
  );
}
