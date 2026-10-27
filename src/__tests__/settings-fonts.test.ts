import { beforeEach, describe, expect, it, vi } from "vitest";
import { installTestDom } from "./setup";
import { DEFAULT_SETTINGS, type Settings } from "../settings";
import { fontPicker, validCustomFont } from "../settings-screen/fonts";
import { editingPage } from "../settings-screen/page-editing";
import { generalPage } from "../settings-screen/page-general";
import type { ScreenDeps } from "../settings-screen/screen";

describe("validCustomFont", () => {
  it("accepts and trims an ordinary family name", () => {
    expect(validCustomFont("  Fira Code ")).toBe("Fira Code");
  });

  it("rejects empty, overlong and CSS-breaking names", () => {
    expect(validCustomFont("")).toBeNull();
    expect(validCustomFont("   ")).toBeNull();
    expect(validCustomFont("a".repeat(81))).toBeNull();
    for (const bad of ['Inter"; color: red', "a;b", "a{b}", "<script>", "a\\b", "a\nb", "a\u0000b"]) {
      expect(validCustomFont(bad), bad).toBeNull();
    }
  });
});

describe("fontPicker", () => {
  beforeEach(() => installTestDom());

  const parts = (node: HTMLElement) => ({
    select: node.querySelector("select") as HTMLSelectElement,
    input: node.querySelector("input") as HTMLInputElement,
    custom: node.querySelector(".st-font-custom") as HTMLElement,
  });
  const key = (input: HTMLInputElement, name: string) =>
    input.dispatchEvent(Object.assign(new Event("keydown", { cancelable: true }), { key: name }));

  it("applies a curated choice at once", () => {
    const onChange = vi.fn();
    const { select, custom } = parts(fontPicker("Editor font", "", onChange));
    expect(custom.hidden).toBe(true);
    select.value = "Georgia";
    select.dispatchEvent(new Event("change"));
    expect(onChange).toHaveBeenCalledWith("Georgia");
  });

  it("shows a saved non-curated font as Custom", () => {
    const { select, input, custom } = parts(fontPicker("Editor font", "Fira Code", vi.fn()));
    expect(select.value).toBe("__custom__");
    expect(custom.hidden).toBe(false);
    expect(input.value).toBe("Fira Code");
  });

  it("applies a custom name on Enter", () => {
    const onChange = vi.fn();
    const { input } = parts(fontPicker("Editor font", "Fira Code", onChange));
    input.value = "Source Serif 4";
    key(input, "Enter");
    expect(onChange).toHaveBeenCalledWith("Source Serif 4");
  });

  it("keeps the saved font when the custom name is unusable", () => {
    const onChange = vi.fn();
    const { input } = parts(fontPicker("Editor font", "Fira Code", onChange));
    input.value = 'x"; background: url(evil)';
    key(input, "Enter");
    expect(onChange).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    input.dispatchEvent(new Event("blur"));
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("Fira Code");
  });

  it("restores the saved font on Escape without leaving the screen", () => {
    const onChange = vi.fn();
    const { input } = parts(fontPicker("Editor font", "Fira Code", onChange));
    input.value = "Something Else";
    const escape = Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape" });
    const stop = vi.spyOn(escape, "stopPropagation");
    input.dispatchEvent(escape);
    expect(stop).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("Fira Code");
  });
});

describe("typography pages", () => {
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
      openPage: vi.fn(),
    } as unknown as ScreenDeps;
  });

  it("General holds every font and size row", () => {
    const host = document.createElement("div");
    generalPage.render(host, deps);
    for (const id of ["interface-size", "interface-font", "explorer-size", "explorer-font", "main-text-size", "main-font", "sub-text-size", "sub-font"]) {
      expect(host.querySelector(`[data-setting="${id}"]`), id).not.toBeNull();
    }
  });

  it("Editing links to General typography instead of repeating font rows", () => {
    const host = document.createElement("div");
    editingPage.render(host, deps);
    expect(host.querySelector('[data-setting="main-font"]')).toBeNull();
    const link = Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Open General ▸ Typography")!;
    link.dispatchEvent(new Event("click"));
    expect(deps.openPage).toHaveBeenCalledWith("general", "main-text-size");
  });
});
