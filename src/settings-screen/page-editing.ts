import { button, caption, clampStep, pageHeader, row, segmented, select, stepper, textInput, toggle } from "./controls";
import { validImageFolder } from "../image-insert";
import type { SettingsPage } from "./screen";
import { DEFAULT_SETTINGS, type Settings } from "../settings";

export type Zone = "explorer" | "main" | "sub";

export const SIZE_MIN = 10;
export const SIZE_MAX = 28;
export const WRAP_MIN = 20;
export const WRAP_MAX = 200;
export const WRAP_DEFAULT = DEFAULT_SETTINGS.wrapColumn;

export function defaultZoneSize(zone: Zone): number {
  return DEFAULT_SETTINGS[zone].size;
}

export function stepZoneSize(size: number, delta: number): number {
  return clampStep(size, delta, SIZE_MIN, SIZE_MAX);
}

export function stepWrapColumn(column: number, delta: number): number {
  return clampStep(column, delta, WRAP_MIN, WRAP_MAX);
}

export const editingPage: SettingsPage = {
  id: "editing",
  render(host, deps) {
    pageHeader(host, "editing");
    const settings = deps.getSettings();
    // Fonts and sizes have one home, General; this row leads there.
    const fonts = row(
      "editing-fonts",
      "Fonts and sizes",
      "Editor, Sub Editor, File Explorer and app fonts are set in General.",
      button("Open General ▸ Typography", () => deps.openPage?.("general", "main-text-size")),
    );
    host.append(
      caption("Text"),
      fonts,
      caption("Wrapping"),
      row(
        "soft-wrap",
        "Soft wrap",
        "Also in View ▸ Soft Wrap.",
        segmented<Settings["softWrapMode"]>(
          "Soft wrap",
          [
            { value: "off", label: "Off" },
            { value: "window", label: "Window" },
            { value: "guide", label: "Guide" },
          ],
          settings.softWrapMode,
          (value) => deps.onSettingsChange({ ...deps.getSettings(), softWrapMode: value }),
        ),
      ),
      row(
        "wrap-column",
        "Wrap column",
        "Where the Guide mode wraps lines.",
        stepper({
          ariaLabel: "Wrap column",
          value: settings.wrapColumn,
          min: WRAP_MIN,
          max: WRAP_MAX,
          resetTo: WRAP_DEFAULT,
          onChange: (wrapColumn) => deps.onSettingsChange({ ...deps.getSettings(), wrapColumn }),
        }),
      ),
      caption("Navigation"),
      row("sync-scroll", "Sync scroll", "Keep editor and preview in the same section.", toggle("Sync scroll", settings.syncScroll, (syncScroll) => deps.onSettingsChange({ ...deps.getSettings(), syncScroll }))),
      caption("Tables"),
      row(
        "table-format-on-edit",
        "Format tables while editing",
        "Line up the pipes when you move between cells.",
        toggle("Format tables while editing", settings.tables.formatOnEdit, (formatOnEdit) => setTables(deps, { formatOnEdit })),
      ),
      row(
        "table-paste",
        "Paste spreadsheet cells as a table",
        "Paste as Plain Text (⌥⇧⌘V) keeps the tabs.",
        toggle("Paste spreadsheet cells as a table", settings.tables.pasteAsTable, (pasteAsTable) => setTables(deps, { pasteAsTable })),
      ),
      caption("Images"),
      imageFolderRow(settings, deps),
      row(
        "image-paste-name",
        "Pasted image name",
        "How pasted images are named.",
        select<Settings["images"]["pasteName"]>(
          "Pasted image name",
          [
            { value: "note", label: "<note>-<date-time>" },
            { value: "image", label: "image-<date-time>" },
          ],
          settings.images.pasteName,
          (pasteName) => setImages(deps, { pasteName }),
        ),
      ),
      row(
        "image-drop-mode",
        "Drop images into editor",
        "Hold ⌥ while dropping to do the other.",
        segmented<Settings["images"]["dropMode"]>(
          "Drop images into editor",
          [
            { value: "copy", label: "Copy and link" },
            { value: "open", label: "Open the file" },
          ],
          settings.images.dropMode,
          (dropMode) => setImages(deps, { dropMode }),
        ),
      ),
    );
  },
};

type Deps = Parameters<SettingsPage["render"]>[1];

function setImages(deps: Deps, patch: Partial<Settings["images"]>): void {
  const current = deps.getSettings();
  deps.onSettingsChange({ ...current, images: { ...current.images, ...patch } });
}

function setTables(deps: Deps, patch: Partial<Settings["tables"]>): void {
  const current = deps.getSettings();
  deps.onSettingsChange({ ...current, tables: { ...current.tables, ...patch } });
}

function imageFolderRow(settings: Settings, deps: Deps): HTMLElement {
  const input = textInput("Image folder", settings.images.folder, "assets");
  const node = row(
    "image-folder",
    "Image folder",
    "Relative to the note. Use . for the note's own folder.",
    input,
  );
  const note = node.querySelector<HTMLElement>(".st-note");
  const hint = note?.textContent ?? "";
  input.addEventListener("change", () => {
    const folder = input.value.trim();
    const ok = validImageFolder(folder);
    input.setAttribute("aria-invalid", String(!ok));
    if (note) note.textContent = ok ? hint : "Use a folder name inside the note's folder, like assets or img/shots.";
    if (ok) setImages(deps, { folder });
  });
  return node;
}
