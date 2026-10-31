declare module "bidi-js" {
  type Paragraph = { start: number; end: number; level: number };
  type Bidi = {
    getEmbeddingLevels(text: string, direction?: "ltr" | "rtl"): { levels: Uint8Array; paragraphs: Paragraph[] };
  };
  export default function bidiFactory(): Bidi;
}
