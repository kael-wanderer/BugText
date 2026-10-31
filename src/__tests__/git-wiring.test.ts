// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { KEYMAP_COMMANDS, conflictingIds } from "../keymap";
import { parseSettings, type Settings } from "../settings";
import { SETTINGS_PAGES, SETTING_ENTRIES } from "../settings-screen/registry";
import type { ScreenDeps } from "../settings-screen/screen";
import { gitPaletteItems } from "../git/palette";
const diagnostics = vi.hoisted(() => vi.fn());
vi.mock("../git/api", () => ({ gitDiagnostics: diagnostics }));
import { gitPage } from "../settings-screen/page-git";

it("registers a conflict-free menu shortcut and repo-only palette entries", () => {
  expect(KEYMAP_COMMANDS.find(c => c.id === "view.source_control")).toMatchObject({ default: "Ctrl+Shift+G", scope: "menu" });
  expect(conflictingIds({}).size).toBe(0);
  const focus = vi.fn(); expect(gitPaletteItems(false, focus)).toEqual([]);
  const items = gitPaletteItems(true, focus); expect(items.map(i => i.label)).toEqual(["Git: Commit", "Git: Pull", "Git: Push", "Git: Fetch", "Git: Show Log"]);
  items[0].run(); expect(focus).toHaveBeenCalledWith("commit");
});
it("registers Git after Export and parses the source-control setting", () => {
  expect(SETTINGS_PAGES.findIndex(p => p.id === "git")).toBe(SETTINGS_PAGES.findIndex(p => p.id === "export") + 1);
  expect(["git.path", "git.version", "git.show"].every(id => SETTING_ENTRIES.some(entry => entry.id === id && entry.page === "git"))).toBe(true);
  expect(parseSettings("{}").git.showSourceControl).toBe(true);
  expect(parseSettings('{"git":{"showSourceControl":false}}').git.showSourceControl).toBe(false);
});
it("shows diagnostics as text, checks again, and sets the toggle", async () => {
  const hostile = "<img src=x onerror=alert(1)>";
  diagnostics.mockReset().mockResolvedValue({ found: true, path: hostile, version: hostile, supported: true });
  let settings = parseSettings("{}"); const host = document.createElement("div");
  const deps = { getSettings: () => settings, onSettingsChange: (next: Settings) => { settings = next; } } as ScreenDeps;
  await gitPage.render(host, deps); await Promise.resolve();
  expect(host.textContent).toContain(hostile); expect(host.querySelector("img")).toBeNull();
  for (const row of host.querySelectorAll<HTMLElement>("[data-setting]")) expect(SETTING_ENTRIES.some(e => e.id === row.dataset.setting)).toBe(true);
  [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Check again")!.click(); await Promise.resolve(); expect(diagnostics).toHaveBeenCalledWith(true);
  const toggle = host.querySelector<HTMLInputElement>('input.st-switch[role="switch"]')!; toggle.checked = false; toggle.dispatchEvent(new Event("change")); expect(settings.git.showSourceControl).toBe(false);
  diagnostics.mockResolvedValue({ found: false, path: "", version: "", supported: false });
  [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Check again")!.click(); await Promise.resolve();
  expect(host.textContent).toContain("Git was not found. Install it with: brew install git");
});
