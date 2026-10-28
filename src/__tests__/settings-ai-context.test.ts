// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { renderContext } from "../settings-screen/page-ai-context";
import { DEFAULT_AI_SETTINGS } from "../ai/aisettings";
import { DEFAULT_SETTINGS } from "../settings";
it("adds and removes patterns as text without disturbing other AI settings", () => {
  let settings = structuredClone(DEFAULT_AI_SETTINGS); settings.maxContextChars = 60000;
  const host = document.createElement("div");
  renderContext(host, { getAISettings: () => settings, getSettings: () => DEFAULT_SETTINGS, onAISettingsChange: next => { settings = next; }, onSettingsChange: vi.fn() });
  const input = host.querySelector<HTMLInputElement>('[aria-label="Add pattern"]')!; input.value = "<img>/**";
  [...host.querySelectorAll("button")].find(b => b.textContent === "Add")!.click();
  expect(settings.context.exclude).toEqual(["<img>/**"]); expect(settings.maxContextChars).toBe(60000); expect(host.querySelector("img")).toBeNull();
  [...host.querySelectorAll("button")].find(b => b.textContent === "Remove")!.click(); expect(settings.context.exclude).toEqual([]);
});
