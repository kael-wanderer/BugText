import { node } from "./insert-picker";
import { applyRename, type NoteEdits, type RenameWriter } from "./rename-plan";
export type ReviewTexts = { title: string; intro: string; outsideHeading: string; insideHeading: string; cancel: string; apply(n: number): string; snapshotNote: string };
const defaultTexts: ReviewTexts = { title: "Update links?", intro: "The note has moved. Choose the links to update.", outsideHeading: "Links to this note", insideHeading: "Links inside the moved note", cancel: "Don't Update", apply: n => `Update ${n} link${n === 1 ? "" : "s"}`, snapshotNote: "Closed notes get a Recovery snapshot first." };
export function showRenameReview(plans: NoteEdits[], folder: string, deps: RenameWriter, report: (text: string) => void, texts: ReviewTexts = defaultTexts): Promise<{ stale: number; failed: number }> {
  if (!plans.length) return Promise.resolve({ stale: 0, failed: 0 });
  return new Promise((resolve) => {
    const previous = document.activeElement as HTMLElement | null;
    const scrim = node("div", undefined, "recovery-scrim link-rename-review");
    const sheet = node("section", undefined, "recovery-sheet");
    sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-label", texts.title);
    const head = node("header"); head.append(node("h3", texts.title));
    const intro = node("p", texts.intro, "link-review-intro");
    const foot = node("footer");
    const cancel = node("button", texts.cancel), apply = node("button");
    foot.append(node("span", texts.snapshotNote), cancel, apply);
    const close = (result = { stale: 0, failed: 0 }) => { scrim.remove(); previous?.focus(); resolve(result); };
    cancel.onclick = () => close();
    const count = () => { const n = plans.reduce((sum, p) => sum + p.edits.filter((e) => e.checked).length, 0); apply.textContent = texts.apply(n); apply.disabled = n === 0; };
    sheet.append(head, intro);
    for (const inside of [false, true]) {
      const group = plans.filter((p) => p.edits.some((e) => e.inside === inside));
      if (!group.length) continue;
      sheet.append(node("h4", inside ? texts.insideHeading : texts.outsideHeading, "link-review-intro"));
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
        close({ stale: changed, failed: failures });
      }).catch(() => { report("Could not update links"); close({ stale: 0, failed: 1 }); });
    };
    scrim.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Escape" && !cancel.disabled) close(); };
    scrim.onclick = (e) => { if (e.target === scrim && !cancel.disabled) close(); };
    sheet.append(foot); scrim.append(sheet); document.body.append(scrim); count(); cancel.focus();
  });
}
