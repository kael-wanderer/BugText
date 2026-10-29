// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { exportPage, selectExportPreset } from "../settings-screen/page-export";
import { searchSettings } from "../settings-screen/registry";
import { parseSettings, type Settings } from "../settings";
import type { ScreenDeps } from "../settings-screen/screen";

it("creates, renames, duplicates, deletes and restores a preset", async () => {
  let settings = parseSettings("{}");
  const host = document.createElement("div"); document.body.append(host); selectExportPreset("standard");
  const deps = { getSettings: () => settings, onSettingsChange: (next: Settings) => { settings = next; }, exportTools: { diagnostics: vi.fn(async () => ({ pandoc: { found: true, version: "p", path: "/p" }, typst: { found: true, version: "t", path: "/t" }, fonts: [] })), copy: vi.fn() } } as unknown as ScreenDeps;
  exportPage.render(host, deps); await Promise.resolve();
  const click = (name: string) => { const el = Array.from(host.querySelectorAll("button")).find(b => b.textContent === name)!; expect(el.disabled).toBe(false); el.click(); };
  expect(host.querySelector<HTMLInputElement>('[aria-label="Margins"]')!.disabled).toBe(true);
  click("New"); click("Save name"); expect(settings.export.presets).toHaveLength(1);
  click("Rename"); const name = host.querySelector<HTMLInputElement>('[aria-label="Preset name"]')!; name.value = "Report"; click("Save name"); expect(host.querySelector('[role="alert"]')!.textContent).toContain("unique"); name.value = "Mine"; click("Save name");
  expect(settings.export.presets[0].name).toBe("Mine");
  click("Duplicate"); click("Save name"); expect(settings.export.presets).toHaveLength(2);
  click("Delete"); expect(settings.export.presets).toHaveLength(1);
  // The settings screen re-renders the page after a save; the Undo toast must survive that.
  exportPage.render(host, deps); await Promise.resolve();
  const toast = document.querySelector('.app-toast')!; expect(toast.textContent).toContain('Deleted "Mine copy"');
  toast.querySelector("button")!.click(); expect(settings.export.presets).toHaveLength(2);
  const picker = host.querySelector<HTMLSelectElement>('[aria-label="Export preset"]')!; picker.value = "handout"; picker.dispatchEvent(new Event("change"));
  const margin = host.querySelector<HTMLInputElement>('[aria-label="Margins"]')!; margin.value = "30"; margin.dispatchEvent(new Event("change"));
  expect(settings.export.presets.find(p => p.id === "handout")?.page.marginMm).toBe(30);
  // The settings UI updates reset state on the next page render.
  exportPage.render(host, deps); await Promise.resolve(); click("Reset"); expect(settings.export.presets.some(p => p.id === "handout")).toBe(false);
  expect(searchSettings("margins").some(hit => hit.page === "export" && hit.id === "export-margins")).toBe(true);
  host.remove();
});

it("edits a user preset in place so the list order stays the same", async () => {
  let settings = parseSettings(JSON.stringify({ export: { presets: [] } }));
  const handout = (await import("../export/presets")).BUILT_IN_PRESETS[1];
  const { builtIn: _b, ...base } = handout;
  settings = { ...settings, export: { ...settings.export, presets: [{ ...base, id: "a", name: "A" }, { ...base, id: "b", name: "B" }] } };
  const host = document.createElement("div"); document.body.append(host); selectExportPreset("a");
  const deps = { getSettings: () => settings, onSettingsChange: (next: Settings) => { settings = next; }, exportTools: { diagnostics: vi.fn(async () => ({ pandoc: { found: true, version: "p", path: "/p" }, typst: { found: true, version: "t", path: "/t" }, fonts: [] })), copy: vi.fn() } } as unknown as ScreenDeps;
  exportPage.render(host, deps); await Promise.resolve();
  const margin = host.querySelector<HTMLInputElement>('[aria-label="Margins"]')!; margin.value = "33"; margin.dispatchEvent(new Event("change"));
  expect(settings.export.presets.map(p => p.id)).toEqual(["a", "b"]);
  expect(settings.export.presets[0].page.marginMm).toBe(33);
  host.remove();
});
