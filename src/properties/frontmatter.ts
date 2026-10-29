export type FrontMatter = { start: number; end: number; block: string };

export function findFrontMatter(source: string): FrontMatter | null {
  const first = /^---[ \t]*\r?\n/.exec(source);
  if (!first) return null;
  const rest = source.slice(first[0].length);
  const closing = /^(?:---|\.\.\.)[ \t]*\r?(?:\n|$)/m.exec(rest);
  if (!closing) return null;
  return { start: 0, end: first[0].length + closing.index + closing[0].length, block: rest.slice(0, closing.index) };
}
