/**
 * Recognise an uploaded file by its first bytes, not by its name or the type the
 * browser claims. Only plain images and PDF are accepted, never SVG or HTML,
 * so an upload can't carry scripts.
 */
export type FileKind = { mime: string; ext: string };

const KINDS: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/webp", ext: "webp", test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  { mime: "application/pdf", ext: "pdf", test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
];

export function detectFile(buf: Buffer, allowed: readonly string[]): FileKind | null {
  const k = KINDS.find((x) => allowed.includes(x.mime) && x.test(buf));
  return k ? { mime: k.mime, ext: k.ext } : null;
}

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const RECEIPT_TYPES = [...IMAGE_TYPES, "application/pdf"] as const;

/** A short, safe file name for display (no paths, no control characters) */
export function cleanFileName(name: string, ext: string) {
  const base = name
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f<>:"|?*]/g, "")
    .trim()
    .slice(0, 80);
  return base || `receipt.${ext}`;
}

export const MB = 1024 * 1024;
