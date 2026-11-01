"use client";

import { useEffect, useState } from "react";


/**
 * Pick a photo and see how the top of the home page will look with it (headline, booking box; the photo as it is)
 * before uploading. Nothing changes on the site until "save" is pressed.
 */
export function HeroUploader({ current, title, lead }: { current: string | null; title: string; lead: string }) {
  const [file, setFile] = useState<string | null>(null);
  useEffect(() => () => void (file && URL.revokeObjectURL(file)), [file]);
  const src = file ?? current;

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="block text-sm font-medium mb-1">{current ? "أضف صورة أخرى" : "صورة الخلفية"}</span>
        <input
          type="file"
          name="hero"
          accept="image/png,image/jpeg,image/webp"
          required
          className="field"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (file) URL.revokeObjectURL(file);
            setFile(f ? URL.createObjectURL(f) : null);
          }}
        />
      </label>


      {/* the preview: a small copy of the top of the home page */}
      <figure className="space-y-1" data-testid="hero-preview">
        <figcaption className="text-sm font-medium">{file ? "معاينة قبل الحفظ" : "معاينة"}</figcaption>
        <div className="relative isolate overflow-hidden rounded-lg border border-line bg-paper aspect-[16/7] text-ink" dir="rtl">
          {src ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview or our own API route */}
              <img src={src} alt="" className="absolute inset-0 -z-10 size-full object-cover" data-preview-src={file ? "new" : "current"} />
            </>
          ) : (
            <div className="absolute inset-0 -z-10 grid place-items-center text-sm text-muted">اختر صورة لترى المعاينة</div>
          )}
          <div className="p-[4%] h-full flex flex-col justify-between gap-2">
            <div>
              <p className="font-semibold text-[clamp(0.8rem,2.4vw,1.4rem)] leading-tight max-w-[18ch]">{title}</p>
              <p className="mt-1 text-[clamp(0.55rem,1.2vw,0.8rem)] text-muted max-w-[45ch] line-clamp-2">{lead}</p>
            </div>
            <div className="booking-box w-3/4 max-w-md p-[2%] grid grid-cols-3 gap-[3%]" aria-hidden="true">
              <span className="h-3 sm:h-5 rounded bg-white/90" />
              <span className="h-3 sm:h-5 rounded bg-white/90" />
              <span className="h-3 sm:h-5 rounded bg-amber" />
            </div>
          </div>
        </div>
        {file && <p className="text-xs text-muted">هذه معاينة فقط. اضغط «حفظ الخلفية» لتظهر في الموقع.</p>}
      </figure>
    </div>
  );
}
