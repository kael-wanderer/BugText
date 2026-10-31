import type { MenuItem } from "../contextmenu";

export function spellMenuItems(_word: string, suggestions: string[], h: { replace(text: string): void; ignore(): void; learn(): void }): MenuItem[] {
  const guesses: MenuItem[] = suggestions.length
    ? suggestions.slice(0, 5).map(label => ({ label, action: () => h.replace(label) }))
    : [{ label: "No Guesses Found", disabled: true }];
  return [...guesses, "separator", { label: "Ignore Spelling", action: h.ignore }, { label: "Learn Spelling", action: h.learn }, "separator"];
}

export function replaceMisspelling(editor: { getText(id: string): string; replaceRange(from: number, to: number, text: string): void }, id: string, hit: { from: number; to: number; word: string }, text: string): void {
  if (editor.getText(id).slice(hit.from, hit.to) === hit.word) editor.replaceRange(hit.from, hit.to, text);
}
