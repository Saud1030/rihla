"use client";

import { useEffect, useRef, useState } from "react";
import { CARD_CM, CARD_PX, DRIVER_PHOTO_MAX } from "@/lib/driver-docs";

export type CropLabels = {
  cropTitle: string;
  cropHint: string;
  zoom: string;
  rotate: string;
  cropOk: string;
  cancel: string;
};

/**
 * Shows the chosen photo under a card-shaped frame (9.56 x 6.4 cm). The driver drags and zooms until the
 * card fills the frame, then the frame's content is saved as a JPEG of exactly CARD_PX, under 1 MB.
 */
export function CardCropper({ file, labels: L, onDone, onCancel }: { file: File; labels: CropLabels; onDone: (f: File) => void; onCancel: () => void }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | HTMLCanvasElement | null>(null);
  const [src, setSrc] = useState<string>("");
  const [frameW, setFrameW] = useState(0);
  const [zoom, setZoom] = useState(1);
  /** where the photo sits in the frame; null = centred */
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; px: number; py: number } | null>(null);

  // read the file
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      setPos(null);
      setImg(im);
      setSrc(url);
    };
    im.onerror = () => onCancel();
    im.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, onCancel]);

  // frame size follows the screen
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setFrameW(el.clientWidth);
      setPos(null);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const frameH = (frameW * CARD_CM.h) / CARD_CM.w;
  const nat = img ? { w: img.width, h: img.height } : { w: 1, h: 1 };
  const cover = img && frameW ? Math.max(frameW / nat.w, frameH / nat.h) : 1;
  const scale = cover * zoom;
  const dispW = nat.w * scale;
  const dispH = nat.h * scale;
  // the photo always covers the whole frame
  const clamp = (p: { x: number; y: number }) => ({
    x: Math.min(0, Math.max(frameW - dispW, p.x)),
    y: Math.min(0, Math.max(frameH - dispH, p.y)),
  });
  const at = clamp(pos ?? { x: (frameW - dispW) / 2, y: (frameH - dispH) / 2 });

  function zoomTo(z: number) {
    // keep the frame's centre fixed while zooming
    const cx = (frameW / 2 - at.x) / scale;
    const cy = (frameH / 2 - at.y) / scale;
    const s2 = cover * z;
    setZoom(z);
    setPos({ x: frameW / 2 - cx * s2, y: frameH / 2 - cy * s2 });
  }

  function rotate() {
    if (!img) return;
    const c = document.createElement("canvas");
    c.width = img.height;
    c.height = img.width;
    const ctx = c.getContext("2d")!;
    ctx.translate(c.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, 0, 0);
    setZoom(1);
    setPos(null);
    setSrc(c.toDataURL("image/jpeg", 0.92));
    setImg(c);
  }

  async function confirm() {
    if (!img || !frameW) return;
    setBusy(true);
    const c = document.createElement("canvas");
    c.width = CARD_PX.w;
    c.height = CARD_PX.h;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = "high";
    const k = CARD_PX.w / frameW;
    ctx.drawImage(img, at.x * k, at.y * k, dispW * k, dispH * k);
    let blob: Blob | null = null;
    for (const q of [0.9, 0.8, 0.7, 0.6, 0.5]) {
      blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", q));
      if (blob && blob.size <= DRIVER_PHOTO_MAX) break;
    }
    setBusy(false);
    if (!blob) return onCancel();
    onDone(new File([blob], file.name.replace(/\.[^.]+$/, "") + "-card.jpg", { type: "image/jpeg" }));
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={L.cropTitle} className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-4" data-testid="card-cropper">
      <div className="w-full max-w-lg rounded-xl bg-paper p-4 space-y-3 shadow-xl">
        <h3 className="font-semibold text-lg">{L.cropTitle}</h3>
        <p className="text-sm text-muted">{L.cropHint}</p>
        <div
          ref={frameRef}
          className="relative w-full overflow-hidden rounded-[4%/6%] bg-stone touch-none select-none cursor-grab active:cursor-grabbing ring-2 ring-sign"
          style={{ aspectRatio: `${CARD_CM.w} / ${CARD_CM.h}` }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, px: at.x, py: at.y };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || d.id !== e.pointerId) return;
            setPos(clamp({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y }));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onWheel={(e) => zoomTo(Math.min(4, Math.max(1, zoom - e.deltaY / 500)))}
        >
          {src && (
            // eslint-disable-next-line @next/next/no-img-element -- local photo being cropped
            <img
              src={src}
              alt=""
              draggable={false}
              className="absolute max-w-none pointer-events-none"
              style={{ left: at.x, top: at.y, width: dispW, height: dispH }}
            />
          )}
          <span className="absolute bottom-1 end-2 rounded bg-ink/60 px-1.5 text-[11px] text-paper tabular" dir="ltr">
            {CARD_CM.w} × {CARD_CM.h} cm
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 grow text-sm">
            <span>{L.zoom}</span>
            <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => zoomTo(Number(e.target.value))} className="grow accent-sign" />
          </label>
          <button type="button" onClick={rotate} className="btn btn-ghost border border-line text-sm">
            ↻ {L.rotate}
          </button>
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} className="btn btn-ghost">
            {L.cancel}
          </button>
          <button type="button" onClick={confirm} disabled={!img || busy} className="btn btn-primary">
            {L.cropOk}
          </button>
        </div>
      </div>
    </div>
  );
}
