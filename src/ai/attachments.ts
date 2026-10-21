import type { AttachedFile } from "./conversation";
const TEXT_EXTENSIONS = new Set([
  "md", "markdown", "txt", "text", "json", "jsonc", "csv", "tsv", "yaml", "yml", "toml", "ini", "cfg", "conf", "html", "htm", "xml", "svg", "css", "scss", "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb", "rs", "go", "java", "c", "h", "cpp", "hpp", "cs", "sh", "bash", "zsh", "sql", "log", "env",
]);
function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}
function isWithin(path: string, folder: string): boolean {
  const cleanPath = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const cleanFolder = folder.replace(/\\/g, "/").replace(/\/+$/, "");
  return cleanPath === cleanFolder || cleanPath.startsWith(`${cleanFolder}/`);
}
export async function prepareCliAttachments(
  paths: string[], folder: string | null,
  readFile: (path: string) => Promise<string>,
): Promise<{ files: AttachedFile[]; paths: string[]; skipped: string[] }> {
  const files: AttachedFile[] = [];
  const readablePaths: string[] = [];
  const skipped: string[] = [];
  for (const path of paths) {
    const name = basename(path);
    if (folder && isWithin(path, folder)) {
      readablePaths.push(path);
      continue;
    }
    if (!TEXT_EXTENSIONS.has(path.split(".").pop()?.toLowerCase() ?? "")) {
      skipped.push(name);
      continue;
    }
    try {
      files.push({ kind: "text", name, content: await readFile(path) });
    } catch {
      skipped.push(name);
    }
  }
  return { files, paths: readablePaths, skipped };
}
