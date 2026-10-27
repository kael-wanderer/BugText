import { mountAppIconPicker } from "./app-icon-picker";
import { button, caption, group, pageHeader, row, segmented, toggle, stepper } from "./controls";
import { fontPicker } from "./fonts";
import { defaultZoneSize } from "./page-editing";
import { DEFAULT_SETTINGS, type Settings } from "../settings";
import type { SettingsPage } from "./screen";

export const generalPage: SettingsPage = {
  id: "general",
  render(host, deps) {
    pageHeader(host, "general");
    const settings = deps.getSettings();

    const zone = (key: "interface" | "explorer" | "main" | "sub", patch: Partial<Settings["main"]>): void =>
      deps.onSettingsChange({ ...deps.getSettings(), [key]: { ...deps.getSettings()[key], ...patch } });
    const sizeRow = (
      key: "interface" | "explorer" | "main" | "sub",
      id: string,
      label: string,
      note: string,
    ): HTMLElement =>
      row(id, label, note, stepper({
        ariaLabel: label.replace("Font Size", "font size"), value: settings[key].size, min: 10, max: 28, unit: "px",
        resetTo: key === "interface" ? DEFAULT_SETTINGS.interface.size : defaultZoneSize(key),
        onChange: (size) => zone(key, { size }),
      }));
    const fontRow = (key: "interface" | "explorer" | "main" | "sub", id: string, label: string): HTMLElement =>
      row(id, label, null, fontPicker(label, settings[key].font, (font) => zone(key, { font })));
    const scope = document.createElement("p");
    scope.className = "st-note st-scope";
    scope.textContent = "PDF pages use zoom. App Font Size changes PDF toolbars and panels, not the page contents.";

    host.append(
      caption("Typography"),
      scope,
      sizeRow("interface", "interface-size", "App Font Size", "Settings, toolbars, tabs, status bar, search, menus and the AI panel."),
      fontRow("interface", "interface-font", "App Font"),
      sizeRow("explorer", "explorer-size", "File Explorer Font Size", "Sidebar file and folder labels."),
      fontRow("explorer", "explorer-font", "File Explorer Font"),
      sizeRow("main", "main-text-size", "Editor Font Size", "Main editor and its reading view."),
      fontRow("main", "main-font", "Editor Font"),
      sizeRow("sub", "sub-text-size", "Sub Editor Font Size", "Second panel editor and reading view when split is open."),
      fontRow("sub", "sub-font", "Sub Editor Font"),
      caption("Startup"),
      row(
        "restore-session",
        "Restore last session",
        "Reopen the folder, tabs and split from last time.",
        toggle("Restore last session", settings.restoreSession, (checked) =>
          deps.onSettingsChange({ ...deps.getSettings(), restoreSession: checked }),
        ),
      ),
      caption("Updates"),
      row(
        "update-mode",
        "Update checks",
        "Automatic checks at most once a day. A new version opens its download page.",
        segmented(
          "Update checks",
          [
            { value: "manual", label: "Manual" },
            { value: "auto", label: "Automatic" },
          ],
          settings.updateMode,
          (value) => deps.onSettingsChange({ ...deps.getSettings(), updateMode: value }),
        ),
      ),
    );

    const version = document.createElement("span");
    version.className = "st-unit";
    version.textContent = "";
    void deps
      .getAppVersion()
      .then((v) => {
        version.textContent = `Version ${v}`;
      })
      .catch(() => {});
    host.append(
      row(
        "check-updates",
        "Check for updates",
        null,
        group(version, button("Check Now", () => deps.onCheckForUpdates())),
      ),
      caption("Settings files"),
      row(
        "settings-files",
        "Edit as JSON",
        "Opens the file as a tab and leaves settings.",
        group(
          button("Open settings.json", () => deps.onOpenSettingsFile()),
          button("Open agent.json", () => deps.onOpenAISettingsFile()),
        ),
      ),
    );

    const slot = document.createElement("div");
    slot.dataset.slot = "app-icon";
    host.append(slot);
    mountAppIconPicker(slot, deps);
  },
};
