// Patterns use folder-relative paths. A basename-only glob matches at any depth.
export function relativeContextPath(path: string, folder: string | null): string {
  const normalize = (value: string) => {
    const parts: string[] = [];
    for (const part of value.replace(/\\/g, "/").split("/")) {
      if (part === "..") parts.pop(); else if (part && part !== ".") parts.push(part);
    }
    return (value.startsWith("/") ? "/" : "") + parts.join("/");
  };
  const clean = normalize(path); const root = folder ? normalize(folder).replace(/\/$/, "") : "";
  return root && clean.startsWith(root + "/") ? clean.slice(root.length + 1) : clean.replace(/^\//, "");
}
export function matchesContextGlob(path: string, pattern: string): boolean {
  const glob = pattern.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!glob) return false;
  let expression = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      i++; if (glob[i + 1] === "/") { i++; expression += "(?:.*/)?"; } else expression += ".*";
    } else if (c === "*") expression += "[^/]*";
    else if (c === "?") expression += "[^/]";
    else expression += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^(?:${glob.includes("/") ? "" : "(?:.*/)?"}${expression})$`).test(path.replace(/\\/g, "/"));
}
export function isContextExcluded(path: string | null | undefined, folder: string | null, patterns: readonly string[]): boolean {
  return !!path && patterns.some(pattern => matchesContextGlob(relativeContextPath(path, folder), pattern));
}
export function exclusionMessage(path: string, folder: string | null): string {
  return `${relativeContextPath(path, folder)} is excluded from AI context in Settings.`;
}
