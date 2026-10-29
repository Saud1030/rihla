"use client";

import { useEffect, useState } from "react";

export const VEHICLE_IMAGE_MAX = 2 * 1024 * 1024;

/** Car photo: pick a file from the device, see it right away; files over 2 MB are refused before sending */
export function VehicleImageField({ current: saved, fallback }: { current: string | null; fallback: string }) {
  // the built-in drawings (/vehicles/<category>.svg) count as "no photo"
  const current = saved && !saved.startsWith("/vehicles/") ? saved : null;
  const [preview, setPreview] = useState<string | null>(null);
  const [tooBig, setTooBig] = useState(false);
  const [remove, setRemove] = useState(false);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const shown = preview ?? (remove ? fallback : (saved ?? fallback));

  return (
    <div className="rounded-lg border border-line p-3 space-y-3" data-testid="vehicle-image">
      <div className="flex flex-wrap items-center gap-4">
        <span className="grid place-items-center w-40 h-24 rounded-md bg-stone overflow-hidden shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file */}
          <img src={shown} alt="صورة السيارة" className="max-w-full max-h-full object-contain" />
        </span>
        <div className="space-y-2 min-w-0">
          <label className="btn btn-ghost border border-line cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sign">
            {current || preview ? "تغيير الصورة" : "تحميل صورة"}
            <input
              type="file"
              name="image"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && f.size > VEHICLE_IMAGE_MAX) {
                  e.target.value = "";
                  setTooBig(true);
                  setPreview(null);
                  return;
                }
                setTooBig(false);
                setRemove(false);
                setPreview(f ? URL.createObjectURL(f) : null);
              }}
            />
          </label>
          <p className="text-xs text-muted">PNG أو JPG أو WEBP، أقل من ٢ ميجابايت. الأفضل صورة بخلفية شفافة أو بيضاء.</p>
          {current && !preview && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="removeImage" checked={remove} onChange={(e) => setRemove(e.target.checked)} className="size-4 accent-sign" />
              <span>حذف الصورة واستخدام الرسم الافتراضي</span>
            </label>
          )}
        </div>
      </div>
      {tooBig && (
        <p role="alert" className="text-xs text-danger">
          حجم الصورة أكبر من ٢ ميجابايت. صغّرها ثم اخترها مرة أخرى.
        </p>
      )}
    </div>
  );
}
