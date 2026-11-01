import type { Pruned } from "./writer";

type Summary = { moved: number; rotated: number; deleted: number; inserted: number };
function sheet<T extends string>(title: string, lines: string[], choices: { label: string; value: T }[], cancel: T): Promise<T> {
  return new Promise(resolve => {
    const doc = document, previous = doc.activeElement as HTMLElement | null;
    const make = <K extends keyof HTMLElementTagNameMap>(tag: K, value = "") => { const el = doc.createElement(tag); el.textContent = value; return el; };
    const scrim = make("div"), panel = make("section"), header = make("header"), body = make("div"), footer = make("footer");
    scrim.className = "recovery-scrim"; panel.className = "recovery-sheet table-sheet"; body.className = "table-sheet-body";
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); panel.setAttribute("aria-label", title);
    header.append(make("h2", title)); for (const line of lines) body.append(make("p", line));
    const finish = (value: T) => { scrim.remove(); previous?.focus(); resolve(value); };
    for (const choice of choices) { const button = make("button", choice.label); button.type = "button"; button.onclick = () => finish(choice.value); footer.append(button); }
    panel.append(header, body, footer); scrim.append(panel); doc.body.append(scrim);
    scrim.onkeydown = e => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(cancel); }
      if (e.key === "Tab") { const buttons = Array.from(panel.querySelectorAll("button")); const i = buttons.indexOf(doc.activeElement as HTMLButtonElement); if (e.shiftKey && i <= 0) { e.preventDefault(); buttons[buttons.length - 1]?.focus(); } else if (!e.shiftKey && i === buttons.length - 1) { e.preventDefault(); buttons[0]?.focus(); } }
    };
    footer.querySelector("button")?.focus();
  });
}
const count = (n: number, singular: string, plural = `${singular}s`) => `${n} ${n === 1 ? singular : plural}`;
export async function confirmOrganizedSave(options: { fileName: string; summary: Summary; pages: number; removedHighlights: number; pruned: Pruned; signed: boolean; changedOnDisk: boolean }): Promise<boolean> {
  const { summary: s, pruned: p } = options;
  const lines = [options.changedOnDisk ? "This PDF changed on disk after BugText opened it. Saving replaces the newer file (BugText backs it up first)." : `Save the new page order into ${options.fileName}? BugText saves a Recovery snapshot and a backup copy first.`, `${count(options.pages, "page")}: ${s.moved} moved, ${s.rotated} rotated, ${s.deleted} deleted, ${s.inserted} inserted.`];
  if (options.removedHighlights) lines.push(`${count(options.removedHighlights, "highlight")} ${options.removedHighlights === 1 ? "is" : "are"} on deleted pages and will be removed.`);
  const losses = [p.bookmarks && count(p.bookmarks, "bookmark"), p.links && count(p.links, "link"), p.fields && count(p.fields, "form field")].filter(Boolean);
  if (losses.length) lines.push(`${losses.join(" and ")} point to deleted pages and will be removed.`);
  if (options.signed) lines.push("This PDF is digitally signed. Changing its pages invalidates the signature.");
  return (await sheet("Save organized PDF", lines, [{ label: "Cancel", value: "cancel" }, { label: options.changedOnDisk ? "Save Anyway" : "Save", value: "save" }], "cancel")) === "save";
}
export function confirmClose(changes: number): Promise<"cancel" | "discard" | "save"> {
  return sheet("Close Organize Pages?", [`${count(changes, "change")} will be lost unless saved.`], [{ label: "Cancel", value: "cancel" }, { label: "Discard", value: "discard" }, { label: "Save…", value: "save" }], "cancel");
}
export function pendingEdits(): Promise<"save" | "cancel"> {
  return sheet("PDF edits pending", ["Save or discard your PDF edits before organizing pages."], [{ label: "Cancel", value: "cancel" }, { label: "Save Edits", value: "save" }], "cancel");
}
