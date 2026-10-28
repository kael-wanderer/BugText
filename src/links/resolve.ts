import { parentPath } from "../paths";

export type ResolvedLink = { kind: "note" | "web" | "file" | "invalid"; path?: string; anchor?: string };

function normalize(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return (path.startsWith("/") ? "/" : "") + parts.join("/");
}

export function resolveLink(target: string, fromNote: string, folder: string | null): ResolvedLink {
  target = target.replace(/^<(.*)>$/, "$1").replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~\\])/g, "$1");
  if (/^[a-z][a-z\d+.-]*:/i.test(target)) {
    return /^(https?:|mailto:)/i.test(target) ? { kind: "web", path: target } : { kind: "invalid" };
  }
  if (target.startsWith("//")) return { kind: "invalid" };
  const hash = target.indexOf("#");
  let path: string;
  let anchor: string | undefined;
  try {
    path = decodeURIComponent(hash < 0 ? target : target.slice(0, hash));
    anchor = hash < 0 ? undefined : decodeURIComponent(target.slice(hash + 1));
  } catch { return { kind: "invalid" }; }
  if (/[\u0000-\u001f]/.test(path)) return { kind: "invalid" };
  const absolute = /^(\/|[a-z]:[\\/])/i.test(path);
  path = normalize(path ? (absolute ? path : `${parentPath(fromNote)}/${path}`) : fromNote);
  const root = folder === null ? null : normalize(folder);
  const inside = root !== null && (path === root || path.startsWith(`${root === "/" ? "" : root}/`));
  return { kind: !absolute && inside && /\.(md|markdown)$/i.test(path) ? "note" : "file", path, anchor };
}
