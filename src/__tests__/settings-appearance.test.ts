import { beforeEach, expect, it, vi } from "vitest";
import { installTestDom } from "./setup";
import { DEFAULT_SETTINGS, type Settings } from "../settings";
import { themePage } from "../settings-screen/page-theme";
import { generalPage } from "../settings-screen/page-general";
import type { ScreenDeps } from "../settings-screen/screen";

let settings: Settings;
let deps: ScreenDeps;
beforeEach(() => {
  installTestDom();
  settings = structuredClone(DEFAULT_SETTINGS);
  deps = {
    getSettings: () => settings,
    onSettingsChange: (next: Settings) => { settings = next; },
    getAppVersion: async () => "test",
    isMac: false,
    onCheckForUpdates: vi.fn(), onOpenSettingsFile: vi.fn(), onOpenAISettingsFile: vi.fn(),
  } as unknown as ScreenDeps;
});

it("General changes explorer text size independently of editor text", () => {
  const host = document.createElement("div");
  generalPage.render(host, deps);
  const control = host.querySelector('[data-setting="explorer-size"]')!;
  control.querySelector('[aria-label="Increase Explorer font size"]')!.dispatchEvent(new Event("click"));
  expect(settings.explorer.size).toBe(14);
  expect(settings.main.size).toBe(15);
});

it("keeps a dark palette while light and applies it when returning to dark", () => {
  settings.theme = "light";
  const host = document.createElement("div");
  themePage.render(host, deps);
  const darkList = host.querySelector('[data-setting="dark-theme"]')!;
  const nord = Array.from(darkList.querySelectorAll("button")).find((b) => b.textContent?.includes("Nord"))!;
  nord.dispatchEvent(new Event("click"));
  expect(settings.theme).toBe("light");
  expect(settings.darkTheme).toBe("nord");
  const appearance = host.querySelector('[aria-label="Appearance"]')!;
  Array.from(appearance.querySelectorAll("button")).find((b) => b.textContent === "Dark")!.dispatchEvent(new Event("click"));
  expect(settings.theme).toBe("nord");
});

it("filters themes without changing the selected palette", () => {
  const host = document.createElement("div");
  themePage.render(host, deps);
  const search = host.querySelector<HTMLInputElement>('[aria-label="Search dark themes"]')!;
  search.value = "nothing matches";
  search.dispatchEvent(new Event("input"));
  expect(host.querySelector('[data-setting="dark-theme"]')!.querySelectorAll("button").length).toBe(0);
  expect(settings.darkTheme).toBe("dark");
});

it("shows ten themes of each kind and remembers light palettes independently", () => {
  const host = document.createElement("div");
  themePage.render(host, deps);
  const dark = host.querySelector('[data-setting="dark-theme"]')!;
  const light = host.querySelector('[data-setting="light-theme"]')!;
  expect(dark.querySelectorAll("button").length).toBe(10);
  expect(light.querySelectorAll("button").length).toBe(10);
  Array.from(light.querySelectorAll("button")).find((b) => b.textContent?.includes("Solarized Light"))!.dispatchEvent(new Event("click"));
  expect(settings.lightTheme).toBe("solarized-light");
  expect(settings.theme).toBe("dark");
  const appearance = host.querySelector('[aria-label="Appearance"]')!;
  Array.from(appearance.querySelectorAll("button")).find((b) => b.textContent === "Light")!.dispatchEvent(new Event("click"));
  expect(settings.theme).toBe("solarized-light");
});

it("General changes document text independently of app and explorer text", () => {
  const host = document.createElement("div");
  generalPage.render(host, deps);
  host.querySelector('[aria-label="Increase Editor font size"]')!.dispatchEvent(new Event("click"));
  expect(settings.main.size).toBe(16);
  expect(settings.interface.size).toBe(14);
  expect(settings.explorer.size).toBe(13);
});
