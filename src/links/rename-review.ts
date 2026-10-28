import { node } from "./insert-picker";
import { applyRename, type NoteEdits, type RenameWriter } from "./rename-plan";
export function showRenameReview(plans: NoteEdits[], folder: string, deps: RenameWriter, report: (text: string) => void): Promise<void> {
  if (!plans.length) return Promise.resolve();
  return new Promise((resolve) => {
    const previous = document.activeElement as HTMLElement | null;
    const scrim = node("div", undefined, "recovery-scrim link-rename-review");
    const sheet = node("section", undefined, "recovery-sheet");
    sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-label", "Update links?");
    const head = node("header"); head.append(node("h3", "Update links?"));
    const intro = node("p", "The note has moved. Choose the links to update.", "link-review-intro");
    const foot = node("footer");
    const cancel = node("button", "Don't Update"), apply = node("button");
    foot.append(node("span", "Closed notes get a Recovery snapshot first."), cancel, apply);
    const close = () => { scrim.remove(); previous?.focus(); resolve(); };
    cancel.onclick = close;
    const count = () => { const n = plans.reduce((sum, p) => sum + p.edits.filter((e) => e.checked).length, 0); apply.textContent = `Update ${n} link${n === 1 ? "" : "s"}`; apply.disabled = n === 0; };
    sheet.append(head, intro);
    for (const inside of [false, true]) {
      const group = plans.filter((p) => p.edits.some((e) => e.inside === inside));
      if (!group.length) continue;
      sheet.append(node("h4", inside ? "Links inside the moved note" : "Links to this note", "link-review-intro"));
      for (const plan of group) {
        const section = node("section", undefined, "link-review-note");
        section.append(node("strong", plan.path.slice(folder.length + 1)));
        if (deps.findOpen(plan.path)) section.append(node("small", "Open, unsaved after update"));
        for (const edit of plan.edits.filter((e) => e.inside === inside)) {
          const label = node("label"); const checked = node("input"); checked.type = "checkbox"; checked.checked = true;
          checked.onchange = () => { edit.checked = checked.checked; count(); };
          const line = plan.source.split("\n")[edit.line - 1] ?? "";
          const start = edit.from - (plan.source.lastIndexOf("\n", edit.from - 1) + 1);
          const after = line.slice(0, start) + edit.insert + line.slice(start + edit.to - edit.from);
          label.append(checked, node("pre", `${edit.line}  ${line}\n→  ${after}`)); section.append(label);
        }
        sheet.append(section);
      }
    }
    apply.onclick = () => {
      apply.disabled = true; cancel.disabled = true;
      sheet.querySelectorAll("input").forEach((input) => { input.disabled = true; });
      let failures = 0;
      void applyRename(plans, folder, { ...deps, onFailure: () => { failures++; } }).then((skipped) => {
        const changed = skipped - failures;
        if (changed) report(`Skipped ${changed} note${changed === 1 ? "" : "s"} that changed on disk`);
        if (failures) report(`Skipped ${failures} note${failures === 1 ? "" : "s"} that could not be safely updated`);
        close();
      }).catch(() => { report("Could not update links"); close(); });
    };
    scrim.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Escape" && !cancel.disabled) close(); };
    scrim.onclick = (e) => { if (e.target === scrim && !cancel.disabled) close(); };
    sheet.append(foot); scrim.append(sheet); document.body.append(scrim); count(); cancel.focus();
  });
}
