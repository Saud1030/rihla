"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const LABELS: Record<string, { title: string; hint: string }> = {
  "ar-v": { title: "عربي — طولي ‎9:16‎", hint: "يظهر على الجوال" },
  "ar-h": { title: "عربي — عرضي ‎16:9‎", hint: "يظهر على الكمبيوتر" },
  "en-v": { title: "إنجليزي — طولي ‎9:16‎", hint: "يظهر على الجوال" },
  "en-h": { title: "إنجليزي — عرضي ‎16:9‎", hint: "يظهر على الكمبيوتر" },
};

/** One box per file: preview, upload (with progress) and remove. Files go straight to /api/admin/promo-video. */
export function PromoVideoSlots({ slots, maxMb }: { slots: { slot: string; url: string | null }[]; maxMb: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {slots.map((s) => (
        <Slot key={s.slot} slot={s.slot} url={s.url} maxMb={maxMb} />
      ))}
    </div>
  );
}

function Slot({ slot, url, maxMb }: { slot: string; url: string | null; maxMb: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const label = LABELS[slot];

  const upload = (file: File) => {
    setMsg(null);
    if (file.size > maxMb * 1024 * 1024) return setMsg({ ok: false, text: `حجم الفيديو أكبر من ${maxMb} ميجابايت.` });
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/admin/promo-video?slot=${slot}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setProgress(null);
      if (input.current) input.current.value = "";
      let body: { ok?: boolean; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status === 200 && body.ok) {
        setMsg({ ok: true, text: "تم رفع الفيديو." });
        router.refresh();
      } else setMsg({ ok: false, text: body.error ?? "تعذّر رفع الفيديو. حاول مرة أخرى." });
    };
    xhr.onerror = () => {
      setProgress(null);
      setMsg({ ok: false, text: "انقطع الاتصال أثناء الرفع. حاول مرة أخرى." });
    };
    setProgress(0);
    xhr.send(file);
  };

  const remove = async () => {
    setMsg(null);
    const r = await fetch(`/api/admin/promo-video?slot=${slot}`, { method: "DELETE" });
    if (r.ok) {
      setMsg({ ok: true, text: "تم حذف الفيديو." });
      router.refresh();
    } else setMsg({ ok: false, text: "تعذّر الحذف." });
  };

  return (
    <div className="rounded-xl border border-line p-3 space-y-3" data-testid={`video-slot-${slot}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium">{label.title}</p>
        <p className="text-xs text-muted">{label.hint}</p>
      </div>
      <div className={`grid place-items-center rounded-lg bg-stone overflow-hidden ${slot.endsWith("-v") ? "h-56" : "aspect-video"}`}>
        {url ? (
          <video src={url} muted playsInline controls preload="metadata" className="h-full w-full object-contain bg-black" />
        ) : (
          <span className="text-sm text-muted">لا يوجد فيديو</span>
        )}
      </div>
      {progress !== null && (
        <div className="h-2 rounded-full bg-stone overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="تقدّم الرفع">
          <div className="h-full bg-sign transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn btn-ghost border border-line !min-h-9 text-sm cursor-pointer">
          {url ? "استبدال الفيديو" : "رفع فيديو"}
          <input
            ref={input}
            type="file"
            accept="video/mp4,video/webm"
            className="sr-only"
            disabled={progress !== null}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
        </label>
        {url && progress === null && (
          <button type="button" onClick={remove} className="text-sm text-danger hover:underline">
            حذف
          </button>
        )}
        {msg && <span className={`text-sm ${msg.ok ? "text-sign" : "text-danger"}`} role="status">{msg.text}</span>}
      </div>
    </div>
  );
}
