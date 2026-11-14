// The toolbar's Notes button: how many entries a companion note holds.

const EXCERPT = /^> — \[/;
const NOTE = /^\*\*\d{4}-\d{2}-\d{2}\*\* — \[/;

/** Number of excerpts and notes in a companion note. */
export function countEntries(text: string): number {
  return text.split("\n").filter((line) => EXCERPT.test(line) || NOTE.test(line)).length;
}

export function notesLabel(count: number): string {
  return count > 0 ? `Notes · ${count}` : "Notes";
}
