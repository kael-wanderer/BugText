import { mountAppIconPicker } from "./app-icon-picker";
import { button, caption, group, pageHeader, row, segmented, toggle, stepper, select, textInput } from "./controls";
import { FONT_OPTIONS } from "./fonts";
import { defaultZoneSize } from "./page-editing";
import { DEFAULT_SETTINGS } from "../settings";
import type { SettingsPage } from "./screen";

export const generalPage: SettingsPage = {
  id: "general",
  render(host, deps) {
    pageHeader(host, "general");
    const settings = deps.getSettings();

    host.append(
      caption("Interface"),
      row("interface-size", "App Font Size", "Settings, tabs and interface text. Document text has its own controls below.", stepper({
        ariaLabel: "Interface font size", value: settings.interface.size, min: 10, max: 28, unit: "px", resetTo: DEFAULT_SETTINGS.interface.size,
        onChange: (size) => deps.onSettingsChange({ ...deps.getSettings(), interface: { ...deps.getSettings().interface, size } }),
      })),
      row("interface-font", "Font Family", null, (() => {
        const input = textInput("Interface font family", settings.interface.font, "System font");
        input.addEventListener("change", () => deps.onSettingsChange({ ...deps.getSettings(), interface: { ...deps.getSettings().interface, font: input.value.trim() } }));
        return input;
      })()),
      row("explorer-size", "File Explorer Font Size", "Change sidebar file and folder labels independently.", stepper({
        ariaLabel: "Explorer font size", value: settings.explorer.size, min: 10, max: 28, unit: "px", resetTo: defaultZoneSize("explorer"),
        onChange: (size) => deps.onSettingsChange({ ...deps.getSettings(), explorer: { ...deps.getSettings().explorer, size } }),
      })),
      row("explorer-font", "File Explorer Font Family", null, select("Explorer font family", [
        ...FONT_OPTIONS,
        ...(!FONT_OPTIONS.some((f) => f.value === settings.explorer.font) ? [{ value: settings.explorer.font, label: settings.explorer.font }] : []),
      ], settings.explorer.font, (font) => deps.onSettingsChange({ ...deps.getSettings(), explorer: { ...deps.getSettings().explorer, font } }))),
      caption("Document text"),
      ...(["main", "sub"] as const).map((zone) => row(
        `${zone}-text-size`, zone === "main" ? "Editor Font Size" : "Sub Editor Font Size",
        zone === "main" ? "Text in the main right panel: editor and reading preview." : "Text in the second document panel when split is open.",
        stepper({ ariaLabel: `${zone === "main" ? "Editor" : "Sub editor"} font size`, value: settings[zone].size,
          min: 10, max: 28, unit: "px", resetTo: defaultZoneSize(zone),
          onChange: (size) => deps.onSettingsChange({ ...deps.getSettings(), [zone]: { ...deps.getSettings()[zone], size } }),
        }),
      )),
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
