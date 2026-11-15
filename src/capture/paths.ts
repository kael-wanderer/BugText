// Always loaded: where a document's companion note lives (the Notes button needs it).

const fileName = (path: string): string => path.replace(/\\/g, "/").split("/").pop() ?? path;
const stem = (path: string): string => fileName(path).replace(/\.[^.]+$/, "");

/** "<dir>/<stem>.notes.md" beside the source; null for a path that already ends in ".notes.md". */
export function companionPath(sourcePath: string): string | null {
  const path = sourcePath.replace(/\\/g, "/");
  if (/\.notes\.md$/i.test(path)) return null;
  const slash = path.lastIndexOf("/");
  return `${path.slice(0, slash + 1)}${stem(path)}.notes.md`;
}
