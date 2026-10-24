import { StandardFonts } from "pdf-lib";

/** Reads a font file; resolves null when it is missing or unreadable. */
export type PdfFontBytesLoader = (path: string) => Promise<Uint8Array | null>;

// The 14 standard PDF fonts only encode Western European text. These macOS
// system fonts draw the same faces with Vietnamese and other Latin, Greek and
// Cyrillic letters; Arial Unicode adds CJK and symbols as the last resort.
export const PDF_SYSTEM_FONT_DIR = "/System/Library/Fonts/Supplemental/";
export const PDF_UNICODE_FALLBACK_FONT = "Arial Unicode.ttf";

const SYSTEM_FONT_FILES: Record<StandardFonts, string> = {
  [StandardFonts.Helvetica]: "Arial.ttf",
  [StandardFonts.HelveticaBold]: "Arial Bold.ttf",
  [StandardFonts.HelveticaOblique]: "Arial Italic.ttf",
  [StandardFonts.HelveticaBoldOblique]: "Arial Bold Italic.ttf",
  [StandardFonts.TimesRoman]: "Times New Roman.ttf",
  [StandardFonts.TimesRomanBold]: "Times New Roman Bold.ttf",
  [StandardFonts.TimesRomanItalic]: "Times New Roman Italic.ttf",
  [StandardFonts.TimesRomanBoldItalic]: "Times New Roman Bold Italic.ttf",
  [StandardFonts.Courier]: "Courier New.ttf",
  [StandardFonts.CourierBold]: "Courier New Bold.ttf",
  [StandardFonts.CourierOblique]: "Courier New Italic.ttf",
  [StandardFonts.CourierBoldOblique]: "Courier New Bold Italic.ttf",
  [StandardFonts.Symbol]: PDF_UNICODE_FALLBACK_FONT,
  [StandardFonts.ZapfDingbats]: PDF_UNICODE_FALLBACK_FONT,
};

/** System font files to try, in order, when text does not fit `standard`. */
export function unicodeFontFilesFor(standard: StandardFonts): string[] {
  const face = SYSTEM_FONT_FILES[standard];
  return face === PDF_UNICODE_FALLBACK_FONT ? [face] : [face, PDF_UNICODE_FALLBACK_FONT];
}

/** Characters of `text` (ignoring whitespace) that `supported` lacks, without repeats. */
export function missingCharacters(text: string, supported: ReadonlySet<number>): string[] {
  const missing = new Set<string>();
  for (const character of text) {
    if (/\s/.test(character)) continue;
    if (!supported.has(character.codePointAt(0)!)) missing.add(character);
  }
  return [...missing];
}

export function unsupportedCharactersMessage(characters: string[]): string {
  const list = characters.slice(0, 5).map((character) => `"${character}"`).join(", ");
  return `Can't save the PDF: no installed font can draw ${list}. Remove or replace ${
    characters.length === 1 ? "that character" : "those characters"
  } and save again.`;
}
