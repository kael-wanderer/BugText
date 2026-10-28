// Columns a string takes in a monospace editor font, for lining up table pipes:
// East Asian wide/fullwidth characters and emoji take two, combining marks and
// joiners none.

function wide(cp: number): boolean {
  return (cp >= 0x1100 && cp <= 0x115f) // Hangul Jamo
    || (cp >= 0x2e80 && cp <= 0x303e) // CJK radicals, punctuation
    || (cp >= 0x3041 && cp <= 0x33ff) // Kana, CJK compatibility
    || (cp >= 0x3400 && cp <= 0x4dbf) // CJK extension A
    || (cp >= 0x4e00 && cp <= 0x9fff) // CJK unified ideographs
    || (cp >= 0xa000 && cp <= 0xa4cf) // Yi
    || (cp >= 0xac00 && cp <= 0xd7a3) // Hangul syllables
    || (cp >= 0xf900 && cp <= 0xfaff) // CJK compatibility ideographs
    || (cp >= 0xfe30 && cp <= 0xfe4f) // CJK compatibility forms
    || (cp >= 0xff00 && cp <= 0xff60) // Fullwidth forms
    || (cp >= 0xffe0 && cp <= 0xffe6)
    || (cp >= 0x20000 && cp <= 0x3fffd); // CJK extensions B and later
}

export function displayWidth(text: string): number {
  let width = 0;
  let joined = false;
  for (const char of text) {
    const cp = char.codePointAt(0)!;
    if (cp === 0x200d) {
      joined = true;
      continue;
    }
    if (/\p{Mark}/u.test(char) || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0x1f3fb && cp <= 0x1f3ff)) continue;
    if (joined) {
      // The second half of an emoji ZWJ sequence draws inside the first.
      joined = false;
      continue;
    }
    width += wide(cp) || /\p{Emoji_Presentation}/u.test(char) ? 2 : 1;
  }
  return width;
}
