// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createDiagnostics } from "../perf/diagnostics";
import { showDiagnosticsSheet } from "../perf/diagnostics-sheet";
import { createStatusBar } from "../status-bar/view";
import { createLinkIndex } from "../links/index";
import { createLinksPanel } from "../links/panel";
import { setExplorerNotice } from "../explorer";
import { generalPage } from "../settings-screen/page-general";
import { searchSettings } from "../settings-screen/registry";
import { parseSettings, type Settings } from "../settings";
import type { ScreenDeps } from "../settings-screen/screen";

it("renders the setting and saves its selected value", () => {
  let settings = parseSettings("{}");
  const host = document.createElement("div");
  generalPage.render(host, { getSettings: () => settings, onSettingsChange: (next: Settings) => { settings = next; }, getAppVersion: async () => "1", getAppBuild: async () => "1" } as unknown as ScreenDeps);
  const row = host.querySelector('[data-setting="large-folders"]')!;
  expect(row).toBeTruthy(); expect(searchSettings("slow").some(entry => entry.id === "large-folders")).toBe(true);
  [...row.querySelectorAll("button")].find(button => button.textContent === "Off")!.click();
  expect(settings.performance.largeFolders).toBe("off");
});
it("shows the status control only for large folders", () => {
  const host = document.createElement("div"), open = vi.fn(), bar = createStatusBar(host, () => {}, open);
  const state = { pathOrName: "note.md", enabled: true, cursor: { line: 1, column: 1 }, selection: "", words: 0, dirty: false, recovered: false, largeFolder: false };
  bar.update(state); const button = host.querySelector<HTMLButtonElement>(".status-bar-large")!; expect(button.hidden).toBe(true);
  bar.update({ ...state, largeFolder: true }); expect(button.hidden).toBe(false); button.click(); expect(open).toHaveBeenCalledOnce();
});
it("reports capped indexes and removes the notice when cleared", async () => {
  const tree = document.createElement("div"); tree.id = "explorer-tree"; document.body.append(tree);
  setExplorerNotice("Indexed the first 5,000 files. Some notes are not included.");
  const notice = document.querySelector<HTMLElement>(".explorer-notice")!; expect(notice.getAttribute("role")).toBe("status");
  const index = createLinkIndex(async () => ({ notes: [], stamps: {}, skipped: [], removed: [], walked: 5000, capped: true }));
  await index.ensure("/r"); const host = document.createElement("div");
  await createLinksPanel(host, index, () => ({ path: "/r/a.md", text: "" }), () => {}, () => {}).show(true);
  expect(host.textContent).toContain("Indexed the first 5,000 files.");
  setExplorerNotice(null); expect(notice.hidden).toBe(true); tree.remove(); notice.remove();
});
it("limits the sheet to 20 ticks, copies only metrics and returns focus", () => {
  const opener = document.createElement("button"); document.body.append(opener); opener.focus();
  const diagnostics = createDiagnostics(30); for (let i = 0; i < 25; i++) { diagnostics.begin("timer", "full"); diagnostics.end(); }
  const copy = vi.fn(); const host = document.createElement("div"); document.body.append(host);
  showDiagnosticsSheet(host, { diagnostics, copy });
  expect(host.querySelectorAll("tbody tr")).toHaveLength(20);
  [...host.querySelectorAll("button")].find(button => button.textContent === "Copy as text")!.click();
  expect(copy.mock.calls[0][0]).not.toContain("/"); expect(host.querySelector("img")).toBeNull();
  host.querySelector("section")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(host.childElementCount).toBe(0); expect(document.activeElement).toBe(opener); opener.remove(); host.remove();
});

it("leaves small-folder notices hidden and treats hostile names as text", async () => {
  const hostile = '/r/<img src=x onerror=alert(1)>.md';
  const { parseNote } = await import("../links/index");
  const notes = Array.from({ length: 50 }, (_, i) => parseNote(i ? `/r/${i}.md` : hostile, ""));
  const index = createLinkIndex(async () => ({ notes, stamps: Object.fromEntries(notes.map(note => [note.path, "1"])), skipped: [], removed: [], walked: 50, capped: false }));
  await index.ensure("/r");
  const host = document.createElement("div");
  await createLinksPanel(host, index, () => ({ path: hostile, text: "" }), () => {}, () => {}).show(true);
  expect(host.textContent).not.toContain("Indexed the first"); expect(host.querySelector("img")).toBeNull();
});

it("changes the hover-preview setting from Editing", async () => {
  const { editingPage } = await import("../settings-screen/page-editing");
  let settings = parseSettings("{}"); const host = document.createElement("div");
  editingPage.render(host, { getSettings: () => settings, onSettingsChange: (next: Settings) => { settings = next; } } as unknown as ScreenDeps);
  const row = host.querySelector('[data-setting="links-hover-preview"]')!;
  const toggle = row.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  toggle.checked = false; toggle.dispatchEvent(new Event("change")); expect(settings.links.hoverPreview).toBe(false);
});
