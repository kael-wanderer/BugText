import { beforeEach, expect, it, vi } from "vitest";
import { installTestDom } from "./setup";
import { DEFAULT_SETTINGS, type Settings } from "../settings";
import { themePage } from "../settings-screen/page-theme";
import { generalPage } from "../settings-screen/page-general";
import { restoreSettingFocus, settingFocusKey, type ScreenDeps } from "../settings-screen/screen";

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
  control.querySelector('[aria-label="Increase File Explorer font size"]')!.dispatchEvent(new Event("click"));
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
  // The search is kept for the session; clear it for later tests.
  search.value = "";
  search.dispatchEvent(new Event("input"));
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

it("resets Explorer text to the settings default from General", () => {
  settings.explorer.size = 20;
  const host = document.createElement("div");
  generalPage.render(host, deps);
  const reset = Array.from(host.querySelector('[data-setting="explorer-size"]')!.querySelectorAll("button"))
    .find((b) => b.textContent === "Reset")!;
  reset.dispatchEvent(new Event("click"));
  expect(settings.explorer.size).toBe(DEFAULT_SETTINGS.explorer.size);
});

it("keeps theme list scroll and focus after choosing a lower theme", () => {
  const host = document.createElement("div");
  themePage.render(host, deps);
  const block = host.querySelector('[data-setting="dark-theme"]')!;
  block.querySelector(".st-theme-options")!.scrollTop = 120;
  block.querySelector(".st-theme-options")!.dispatchEvent(new Event("scroll"));
  const buttons = Array.from(block.querySelectorAll("button"));
  const last = buttons[buttons.length - 1];
  last.focus();
  last.dispatchEvent(new Event("click"));
  const list = block.querySelector(".st-theme-options")!;
  expect(list.scrollTop).toBe(120);
  expect((document.activeElement as HTMLElement).dataset.themeId).toBe(settings.darkTheme);
  expect(document.activeElement).not.toBe(last);
});

it("keeps the theme search when the page is rebuilt", () => {
  const first = document.createElement("div");
  themePage.render(first, deps);
  const search = first.querySelector<HTMLInputElement>('[aria-label="Search light themes"]')!;
  search.value = "solar";
  search.dispatchEvent(new Event("input"));
  const second = document.createElement("div");
  themePage.render(second, deps);
  expect(second.querySelector<HTMLInputElement>('[aria-label="Search light themes"]')!.value).toBe("solar");
  expect(second.querySelector('[data-setting="light-theme"]')!.querySelectorAll("button").length).toBeLessThan(10);
  search.value = "";
  search.dispatchEvent(new Event("input"));
});

it("finds the same settings control again after the page is rebuilt", () => {
  const pane = document.createElement("div");
  themePage.render(pane, deps);
  const nord = Array.from(pane.querySelector('[data-setting="dark-theme"]')!.querySelectorAll("button"))
    .find((b) => b.textContent?.includes("Nord"))!;
  nord.focus();
  const key = settingFocusKey(pane, document.activeElement);
  expect(key?.setting).toBe("dark-theme");

  pane.replaceChildren();
  themePage.render(pane, deps);
  expect(restoreSettingFocus(pane, key)).toBe(true);
  expect(document.activeElement).not.toBe(nord);
  expect((document.activeElement as HTMLElement).dataset.themeId).toBe("nord");
});

it("leaves focus alone when it was outside any settings row", () => {
  const pane = document.createElement("div");
  themePage.render(pane, deps);
  expect(settingFocusKey(pane, document.body as unknown as Element)).toBeNull();
  expect(restoreSettingFocus(pane, null)).toBe(false);
  expect(restoreSettingFocus(pane, { setting: "no-such-row", index: 0 })).toBe(false);
});
