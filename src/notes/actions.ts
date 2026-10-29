import type { LinkIndex } from "../links/index";
import type { TemplateSettings } from "../settings";
import { manualSnapshot } from "../recovery";
import { createFromTemplate } from "../templates/library";
import { showToast } from "../toast";
import { planExtraction, extractionReplacement, type SourceBinding, type SourceChange } from "./extract-plan";
import { organizeSheet, node, action, field } from "./sheet";
import { showTaskInbox } from "../task-inbox/panel";
import { inboxTaskChange } from "../task-inbox/model";
import { showNoteTypeSheet } from "../note-types/sheet";

export type OrganizeHost = {
  host: () => HTMLElement;
  getFolder: () => string | null;
  getSource: () => SourceBinding | null;
  /** Must validate tab, revision and original text; dispatch exactly once, leaving dirty. */
  apply: (source: SourceBinding, change: SourceChange) => boolean;
  index: LinkIndex;
  openPath: (path: string, line?: number) => Promise<void>;
  /** Must refuse conflicting dirty ownership in other native windows. */
  openForEdit: (path: string) => Promise<SourceBinding | null>;
  refreshExplorer: () => Promise<void>;
  afterDiskWrite: (path: string) => void;
  getTemplates: () => TemplateSettings;
};

export function createOrganizeActions(host: OrganizeHost) {
  const extractSelection = () => {
    const source = host.getSource(), folder = host.getFolder();
    if (!source || !folder) { showToast("Open a folder and select Markdown text first."); return; }
    const sheet = organizeSheet(host.host(), "Extract to note");
    const title = node("input"); title.value = source.text.slice(source.from, source.to).split("\n").find(line => line.trim())?.replace(/^#+\s*/, "").slice(0, 80) ?? "";
    const preview = node("pre"); const error = node("p"); error.className = "organize-error"; error.setAttribute("role", "alert");
    const dest = node("p"); let busy = false;
    const refresh = () => {
      error.textContent = "";
      try { const plan = planExtraction(source, folder, title.value); preview.textContent = plan.contents; dest.textContent = `Created beside the source: ${plan.dir ? plan.dir + "/" : ""}${plan.stem}.md`; submit.disabled = busy; }
      catch (e) { error.textContent = (e as Error).message; submit.disabled = true; }
    };
    const submit = action("Extract", () => void run());
    const run = async () => {
      if (busy) return; busy = true; refresh();
      try {
        const plan = planExtraction(source, folder, title.value);
        // A required snapshot precedes creation; failure leaves both files untouched.
        await manualSnapshot(source.path!, source.text, "Before extracting a note", true);
        if (sheet.closed) return;
        if (host.getFolder() !== folder) throw new Error("The open folder changed. Reopen Extract to note.");
        const created = await createFromTemplate({ folder, relativeDir: plan.dir, stem: plan.stem, contents: plan.contents });
        host.afterDiskWrite(created);
        const applied = host.apply(source, extractionReplacement(plan, created));
        await host.refreshExplorer().catch(() => {});
        sheet.close();
        showToast(applied ? "Created note. Undo restores the source text; the new note remains." : "Created note, but the source changed. Its selection was not replaced.", 8000, { label: "Open new note", run: () => void host.openPath(created) });
      } catch (e) { error.textContent = e instanceof Error ? e.message : "Could not create the note. Source text is unchanged."; }
      finally { busy = false; submit.disabled = false; }
    };
    title.addEventListener("input", refresh);
    const buttons = node("div"); buttons.className = "organize-actions"; buttons.append(action("Cancel", sheet.close), submit);
    sheet.body.append(field("Title", title), dest, preview, error, node("p", "Undo restores the selected text. The created note remains. Local links and images stay valid because it is created beside this note."), buttons);
    refresh(); title.focus(); title.select();
  };
  const showTasks = () => showTaskInbox(host.host(), {
    index: host.index, folder: host.getFolder,
    open: task => host.openPath(task.path, task.line),
    toggle: async task => {
      const folder = host.getFolder();
      if (!folder || !task.path.startsWith(folder.replace(/\/$/, "") + "/")) throw new Error("The folder changed. Refresh the tasks list.");
      const source = await host.openForEdit(task.path);
      if (!source) throw new Error("Cannot edit this note here. Check whether another window has unsaved changes.");
      const change = inboxTaskChange(task, source.text);
      await manualSnapshot(task.path, source.text, "Before task inbox edit", true);
      if (host.getFolder() !== folder) throw new Error("The folder changed. Reopen the task inbox.");
      if (!host.apply(source, change)) throw new Error("This note changed. Refresh the tasks list and try again.");
      host.index.onFileChanged(task.path, source.text.slice(0, change.from) + change.insert + source.text.slice(change.to));
    },
  });
  return { extractSelection, showTasks, newTypedNote: () => showNoteTypeSheet(host, false), applyNoteType: () => showNoteTypeSheet(host, true) };
}
