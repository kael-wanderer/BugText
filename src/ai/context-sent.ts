export type ContextSent = {
  note?: { label: string; path: string; chars: number };
  excerpts: { path: string; chars: number }[];
  files: { name: string; chars?: number; pathOnly?: boolean }[];
  trimmed: number; action?: boolean;
};
export function renderContextSent(value: unknown, open: (path: string) => void): HTMLElement | null {
  if (!value || typeof value !== "object") return null;
  const data = value as ContextSent;
  if (!Array.isArray(data.excerpts) || !Array.isArray(data.files) || typeof data.trimmed !== "number") return null;
  const details = document.createElement("details"); details.className = "ai-context-sent";
  const summary = document.createElement("summary"); summary.textContent = "Context sent";
  const list = document.createElement("ul"); details.append(summary, list);
  function item(text: string): HTMLLIElement { const li = document.createElement("li"); li.textContent = text; list.append(li); return li; }
  if (data.note && typeof data.note.path === "string" && typeof data.note.label === "string" && typeof data.note.chars === "number") item(`${data.note.label} · ${data.note.path} (${data.note.chars.toLocaleString("en-US")} chars)`);
  const excerpts = data.excerpts.filter(e => e && typeof e.path === "string" && typeof e.chars === "number");
  if (excerpts.length) {
    const paths = [...new Set(excerpts.map(e => e.path))];
    const li = item(`Folder search · ${excerpts.length} excerpts from ${paths.length} notes: `);
    for (const path of paths) { const link = document.createElement("button"); link.type = "button"; link.textContent = path; link.addEventListener("click", () => open(path)); li.append(link); }
  } else if (data.action) item("No folder excerpts (actions send only their input)");
  for (const file of data.files) if (file && typeof file.name === "string") item(`File · ${file.name}${file.pathOnly ? " (path only, CLI)" : typeof file.chars === "number" ? ` (${file.chars.toLocaleString("en-US")} chars)` : ""}`);
  if (data.trimmed > 0) item(`trimmed to fit (−${data.trimmed.toLocaleString("en-US")} chars)`);
  if (!list.children.length) item("No document, folder excerpts or files");
  return details;
}
