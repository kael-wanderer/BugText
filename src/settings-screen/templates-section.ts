import { button, caption, row, segmented, textInput } from "./controls";
import type { ScreenDeps } from "./screen";
import { relativeDestination } from "../templates/naming";
import { DATE_FORMATS, formatDate } from "../templates/placeholders";
import type { Settings } from "../settings";

function patch(deps: ScreenDeps, change: Partial<Settings["templates"]>): void {
  const current = deps.getSettings();
  deps.onSettingsChange({ ...current, templates: { ...current.templates, ...change } });
}

function folderRow(deps: ScreenDeps, settings: Settings): HTMLElement {
  const input = textInput("Templates folder", settings.templates.folder, "Default folder");
  input.classList.add("st-path");
  void deps.templates?.resolveFolder("").then((path) => { if (!input.value) input.placeholder = path; }).catch(() => {});
  input.addEventListener("change", () => patch(deps, { folder: input.value.trim() }));
  const choose = button("Choose…", () => {
    void deps.templates?.chooseFolder().then((path) => {
      if (!path) return;
      input.value = path;
      patch(deps, { folder: path });
    });
  });
  const reset = button("Reset", () => {
    input.value = "";
    patch(deps, { folder: "" });
  });
  const control = document.createElement("span");
  control.className = "st-inline";
  control.append(input, choose, reset);
  return row("templates-folder", "Templates folder", "Every .md file here is a template. Empty uses the app's own folder.", control);
}

/** Folder-relative text rows commit on change and refuse paths that leave the open folder. */
function relativeRow(
  id: string, label: string, note: string, value: string, placeholder: string,
  accept: (value: string) => boolean, save: (value: string) => void,
): { node: HTMLElement; input: HTMLInputElement } {
  const input = textInput(label, value, placeholder);
  const node = row(id, label, note, input);
  input.addEventListener("change", () => {
    const next = input.value.trim();
    const ok = accept(next);
    input.setAttribute("aria-invalid", String(!ok));
    if (ok) save(next);
  });
  return { node, input };
}

export function templatesRows(deps: ScreenDeps): HTMLElement[] {
  const settings = deps.getSettings();
  const now = new Date();
  const defaultFolder = relativeRow(
    "templates-default-folder", "Default folder for new notes", "When a template has no folder. Relative to the open folder.",
    settings.templates.defaultFolder, "Top of the open folder",
    (value) => !("error" in relativeDestination(value, "x")), (defaultFolder) => patch(deps, { defaultFolder }),
  );
  const inbox = relativeRow(
    "quick-note-inbox", "Inbox file", "Relative to the open folder.",
    settings.templates.inboxFile, "Inbox.md",
    (value) => value !== "" && !("error" in relativeDestination("", value)), (inboxFile) => patch(deps, { inboxFile }),
  );
  inbox.input.disabled = settings.templates.quickTarget !== "inbox";
  const manage = document.createElement("span");
  manage.className = "st-inline";
  manage.append(
    button("Open templates folder", () => void deps.templates?.openFolder()),
    button("New template", () => void deps.templates?.newTemplate()),
  );
  return [
    caption("Templates"),
    folderRow(deps, settings),
    defaultFolder.node,
    row(
      "templates-date-format", "Date format", "Used by {{date}}.",
      segmented(
        "Date format",
        DATE_FORMATS.map((value) => ({ value, label: formatDate(now, value) })),
        settings.templates.dateFormat,
        (dateFormat) => patch(deps, { dateFormat }),
      ),
    ),
    row(
      "quick-note-target", "Quick notes go to", null,
      segmented<Settings["templates"]["quickTarget"]>(
        "Quick notes go to",
        [{ value: "daily", label: "Today's daily note" }, { value: "inbox", label: "Inbox file" }],
        settings.templates.quickTarget,
        (quickTarget) => { inbox.input.disabled = quickTarget !== "inbox"; patch(deps, { quickTarget }); },
      ),
    ),
    inbox.node,
    row("templates-manage", "Manage templates", null, manage),
  ];
}
