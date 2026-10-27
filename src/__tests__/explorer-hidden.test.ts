import { beforeEach, describe, expect, it, vi } from "vitest";
import { installTestDom } from "./setup";
import { DEFAULT_SETTINGS, parseSettings, type Settings } from "../settings";
import { isDotName } from "../explorer";
import { generalPage } from "../settings-screen/page-general";
import { SETTING_ENTRIES } from "../settings-screen/registry";
import type { ScreenDeps } from "../settings-screen/screen";

describe("showHiddenFiles setting", () => {
  it("keeps showing hidden files for older settings files", () => {
    expect(parseSettings("{}").showHiddenFiles).toBe(true);
    expect(parseSettings('{ "theme": "nord" }').showHiddenFiles).toBe(true);
  });

  it("keeps an explicit choice", () => {
    expect(parseSettings('{ "showHiddenFiles": false }').showHiddenFiles).toBe(false);
    expect(parseSettings('{ "showHiddenFiles": true }').showHiddenFiles).toBe(true);
  });

  it("ignores values that are not booleans", () => {
    for (const bad of ['"false"', "0", "null", "[]", "{}"]) {
      expect(parseSettings(`{ "showHiddenFiles": ${bad} }`).showHiddenFiles, bad).toBe(true);
    }
  });
});

describe("isDotName", () => {
  it("matches names that start with a dot", () => {
    expect(isDotName(".git")).toBe(true);
    expect(isDotName(".env.local")).toBe(true);
  });

  it("does not match ordinary names with dots inside", () => {
    expect(isDotName("notes.md")).toBe(false);
    expect(isDotName("v1.2")).toBe(false);
    expect(isDotName("")).toBe(false);
  });
});

describe("General page", () => {
  let settings: Settings;
  beforeEach(() => {
    installTestDom();
    settings = structuredClone(DEFAULT_SETTINGS);
  });

  it("toggles Show Hidden Files and lists it in search", () => {
    const deps = {
      getSettings: () => settings,
      onSettingsChange: (next: Settings) => { settings = next; },
      getAppVersion: async () => "test",
      isMac: false,
      onCheckForUpdates: vi.fn(), onOpenSettingsFile: vi.fn(), onOpenAISettingsFile: vi.fn(),
    } as unknown as ScreenDeps;
    const host = document.createElement("div");
    generalPage.render(host, deps);
    const control = host.querySelector('[data-setting="explorer-hidden"]')!;
    expect(control).not.toBeNull();
    const toggle = control.querySelector<HTMLInputElement>('[aria-label="Show Hidden Files"]')!;
    expect(toggle.checked).toBe(true);
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
    expect(settings.showHiddenFiles).toBe(false);
    expect(SETTING_ENTRIES.some((entry) => entry.id === "explorer-hidden")).toBe(true);
  });
});
