import { button, caption, group, pageHeader, row, segmented, toggle } from "./controls";
import type { SettingsPage } from "./screen";

export const generalPage: SettingsPage = {
  id: "general",
  render(host, deps) {
    pageHeader(host, "general");
    const settings = deps.getSettings();

    host.append(
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
        "Automatic checks at most once a day. BugText always asks before installing.",
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
  },
};
