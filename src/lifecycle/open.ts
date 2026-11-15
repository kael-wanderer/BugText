// Where "Superseded by … · Open" may go: a Markdown note inside the open folder only.
import { resolveLink } from "../links/resolve";

export function supersedingPath(target: string, notePath: string, folder: string | null): { path: string } | { error: string } {
  const resolved = resolveLink(target, notePath, folder);
  return resolved.kind === "note" && resolved.path ? { path: resolved.path } : { error: "Opens only notes in this folder." };
}
