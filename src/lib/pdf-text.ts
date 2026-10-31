import "server-only";
import path from "node:path";
import bidiFactory from "bidi-js";

/**
 * Arabic text in PDFs made with pdfkit. pdfkit shapes Arabic letters (through fontkit); the bidi
 * algorithm here puts Arabic and numbers/Latin parts of a line in the right visual order.
 */

const FONTS = path.join(process.cwd(), "assets", "fonts");
const REGULAR = path.join(FONTS, "IBMPlexSansArabic_400Regular.ttf");
const BOLD = path.join(FONTS, "IBMPlexSansArabic_700Bold.ttf");
const bidi = bidiFactory();

const ARABIC = /[\u0600-\u06FF]/;
/** keep a phone number or code in one piece inside Arabic text */
export const isolate = (s: string) => (/[\u0600-\u065F\u066E-\u06FF]/.test(s) ? s : `\u2066${s}\u2069`);

/**
 * What to hand to pdfkit for one run. fontkit shapes and reverses any run it sees as Arabic script,
 * and pdfkit drops plain spaces inside a reversed run, so: spaces become no-break spaces, and a
 * left-to-right run made of Arabic digits is reversed first (fontkit reverses it back).
 */
export function drawable(r: { text: string; rtl: boolean }) {
  let t = r.text.replace(/[\u2066-\u2069\u200E\u200F\u061C]/g, "");
  // brackets are mirrored in right-to-left text
  if (r.rtl) t = t.replace(/[()[\]{}]/g, (c) => ({ "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{" })[c]!);
  if (r.rtl || ARABIC.test(t)) t = t.replace(/ /g, "\u00A0");
  if (!r.rtl && ARABIC.test(t)) t = [...t].reverse().join("");
  return t;
}

/** split a line into same-direction runs, in the order they are drawn from left to right */
export function visualRuns(text: string, base: "rtl" | "ltr" | "auto") {
  // an isolated part (phone, code) is one left-to-right piece: its neutral characters count as Latin
  const probe = text.replace(/\u2066([^\u2069]*)\u2069/g, (_m, inner: string) => `\u2066${"a".repeat(inner.length)}\u2069`);
  const { levels, paragraphs } = bidi.getEmbeddingLevels(probe, base === "auto" ? undefined : base);
  const baseRtl = (paragraphs[0]?.level ?? 0) % 2 === 1;
  const runs: { text: string; rtl: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const rtl = levels[i] % 2 === 1;
    const last = runs[runs.length - 1];
    if (last && last.rtl === rtl) last.text += text[i];
    else runs.push({ text: text[i], rtl });
  }
  return baseRtl ? runs.reverse() : runs;
}


/** the Arabic fonts as "r" (regular) and "b" (bold) */
export function registerFonts(doc: PDFKit.PDFDocument) {
  doc.registerFont("r", REGULAR);
  doc.registerFont("b", BOLD);
}

type LineOpts = { x: number; w: number; y: number; size: number; font?: "r" | "b"; color?: string; align?: "start" | "end" | "center" };

/** line(): one line in a box, aligned to the start side of the language (right for Arabic); wrap(): split text by words to fit a width */
export function pdfWriter(doc: PDFKit.PDFDocument, rtl: boolean, ink = "#1b2420") {
  function line(text: string, o: LineOpts) {
    doc.font(o.font ?? "r").fontSize(o.size).fillColor(o.color ?? ink);
    const runs = visualRuns(text, rtl ? "rtl" : "ltr");
    const widths = runs.map((r) => doc.widthOfString(drawable(r)));
    const total = widths.reduce((a, b) => a + b, 0);
    const toRight = (o.align ?? "start") === "start" ? rtl : o.align === "end" ? !rtl : null;
    let x = toRight === null ? o.x + (o.w - total) / 2 : toRight ? o.x + o.w - total : o.x;
    runs.forEach((r, i) => {
      doc.text(drawable(r), x, o.y, { lineBreak: false });
      x += widths[i];
    });
  }
  function wrap(text: string, size: number, w: number, font: "r" | "b" = "r") {
    doc.font(font).fontSize(size);
    const out: string[] = [];
    let cur = "";
    for (const word of text.split(/\s+/)) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && doc.widthOfString(next) > w) {
        out.push(cur);
        cur = word;
      } else cur = next;
    }
    if (cur) out.push(cur);
    return out;
  }
  return { line, wrap };
}
