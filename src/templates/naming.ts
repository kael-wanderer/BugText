// File-name and destination rules for notes created from templates. Rust enforces
// the same confinement again; this is the early, friendly check.

export const OUTSIDE_FOLDER_ERROR = "Template folder must be inside the open folder.";

const MAX_NAME = 120;

export function safeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[/\\:*?"<>|\u0000-\u001f]/g, "-").replace(/^[\s.]+|[\s.]+$/g, "");
  return (cleaned.slice(0, MAX_NAME).replace(/[\s.]+$/, "") || "Untitled");
}

export type Destination = { dir: string; stem: string; path: string } | { error: string };

/** `folder` is relative to the open folder; `name` has no extension. */
export function relativeDestination(folder: string, name: string): Destination {
  const raw = folder.trim().replace(/\\/g, "/");
  if (raw.startsWith("/") || /^[A-Za-z]:/.test(raw)) return { error: OUTSIDE_FOLDER_ERROR };
  const parts: string[] = [];
  for (const part of raw.split("/")) {
    const p = part.trim();
    if (p === "" || p === ".") continue;
    // eslint-disable-next-line no-control-regex
    if (p === ".." || /[\u0000-\u001f]/.test(p)) return { error: OUTSIDE_FOLDER_ERROR };
    parts.push(p);
  }
  const dir = parts.join("/");
  const stem = safeFileName(name);
  return { dir, stem, path: dir ? `${dir}/${stem}.md` : `${stem}.md` };
}
