"use client";

import { useCallback, useRef, useState } from "react";
import { CARD_SOURCE_MAX, cropShapeFor, DRIVER_PHOTO_MAX } from "@/lib/driver-docs";
import { CardCropper, type CropLabels } from "./card-cropper";

export type PhotoFieldLabels = { pick: string; change: string; tooBig: string; unreadable: string; cardSize: string; photoSize: string; crop: CropLabels };

/**
 * One photo slot: picks an image, shows a preview, refuses anything over 1 MB right away.
 * The personal photo (4 x 4 cm) and the ID, licence and registration (card size) are cropped to
 * their real shape first, so a big phone photo is fine for those: it is made small before sending.
 */
export function PhotoField({ name, label, t, invalid = false, required = true }: { name: string; label: string; t: PhotoFieldLabels; invalid?: boolean; required?: boolean }) {
  const shape = cropShapeFor(name);
  const ratio = shape ? `${shape.cm.w} / ${shape.cm.h}` : undefined;
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [tooBig, setTooBig] = useState(false);
  const [unreadable, setUnreadable] = useState(false);
  const [cropping, setCropping] = useState<File | null>(null);

  const show = (f: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  };
  const cancelCrop = useCallback(() => {
    if (input.current) input.current.value = "";
    setCropping(null);
  }, []);
  const failCrop = useCallback(() => {
    if (input.current) input.current.value = "";
    setCropping(null);
    setUnreadable(true);
  }, []);
  const doneCrop = useCallback(
    (f: File) => {
      const dt = new DataTransfer();
      dt.items.add(f);
      if (input.current) input.current.files = dt.files;
      setCropping(null);
      setTooBig(false);
      show(f);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- show only swaps the preview
    [preview],
  );
  const box = shape ? (shape.cm.w === shape.cm.h ? "w-16" : "w-24") : "size-16";

  return (
    <div className={`rounded-xl border-2 border-dashed p-3 ${invalid || tooBig || unreadable ? "border-danger" : preview ? "border-sign/40" : "border-line"}`} data-photo={name}>
      <p className="text-sm font-medium mb-2">{label}</p>
      <label className="flex items-center gap-3 cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sign rounded-lg">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file
          <img src={preview} alt="" className={`rounded-lg bg-stone ${box} ${shape ? "h-auto object-contain" : "object-cover"}`} style={{ aspectRatio: ratio }} />
        ) : (
          <span className={`grid place-items-center rounded-lg bg-stone text-muted text-2xl ${box}`} style={{ aspectRatio: ratio }} aria-hidden>
            +
          </span>
        )}
        <span className="text-sm text-sign font-medium">{preview ? t.change : t.pick}</span>
        <input
          ref={input}
          type="file"
          name={name}
          accept="image/png,image/jpeg,image/webp"
          required={required}
          className="sr-only"
          aria-label={label}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f && f.size > (shape ? CARD_SOURCE_MAX : DRIVER_PHOTO_MAX)) {
              e.target.value = ""; // never sent
              setTooBig(true);
              show(null);
              return;
            }
            setTooBig(false);
            setUnreadable(false);
            if (f && shape) return setCropping(f); // the cropped file replaces it
            show(f ?? null);
          }}
        />
      </label>
      {shape && <p className="mt-2 text-xs text-muted">{name === "photo" ? t.photoSize : t.cardSize}</p>}
      {(tooBig || unreadable) && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {tooBig ? t.tooBig : t.unreadable}
        </p>
      )}
      {cropping && <CardCropper file={cropping} labels={t.crop} shape={shape ?? undefined} onDone={doneCrop} onCancel={cancelCrop} onFail={failCrop} />}
    </div>
  );
}
