import { gitDiagnostics } from "../git/api";
import type { GitDiagnostics } from "../git/model";
import { button, pageHeader, row, toggle } from "./controls";
import type { SettingsPage } from "./screen";
export const gitPage: SettingsPage = {
  id: "git",
  render(host, deps) {
    let info: GitDiagnostics | null = null;
    const draw = () => {
      host.replaceChildren(); pageHeader(host, "git");
      const path = document.createElement("span"); path.textContent = info ? (info.found ? info.path : "Git was not found. Install it with: brew install git") : "Checking…";
      const version = document.createElement("span"); version.textContent = info?.found ? `${info.version}${info.supported ? "" : " · Git 2.30 or later is required."}` : "—";
      const show = toggle("Show Source Control", deps.getSettings().git.showSourceControl, checked => { const settings = deps.getSettings(); deps.onSettingsChange({ ...settings, git: { ...settings.git, showSourceControl: checked } }); });
      host.append(row("git.path", "Git path", null, path), row("git.version", "Git version", null, version), row("git.show", "Show Source Control", null, show), button("Check again", () => { void check(true); }));
    };
    const check = async (refresh: boolean) => { try { info = await gitDiagnostics(refresh); } catch { info = { found: false, path: "", version: "", supported: false }; } draw(); };
    draw(); void check(false);
  },
};
