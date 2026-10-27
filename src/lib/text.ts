/** Arabic-aware search folding: no diacritics, unify alef/yaa/taa marbuta, lower-case Latin */
export function fold(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "") // tashkeel and tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase()
    .trim();
}
