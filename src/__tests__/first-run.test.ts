// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createFirstRunHint } from "../empty-states/first-run";
import { createOnboarding } from "../empty-states/onboarding";
import { parseSettings, FRESH_SETTINGS_JSON, type Settings } from "../settings";
it("renders the hint and wires dismissal and shortcuts", () => {
  const host = document.createElement("div"), dismiss = vi.fn(), showShortcuts = vi.fn();
  const hint = createFirstRunHint(host, { openFolder: () => {}, newNote: () => {}, showShortcuts, dismiss, keymap: () => ({}) });
  hint.update(true); expect(host.hidden).toBe(false); expect(host.querySelector('[role="region"]')?.getAttribute("aria-label")).toBe("Getting started");
  [...host.querySelectorAll("button")].find(button => button.textContent === "Show Shortcuts")!.click(); expect(showShortcuts).toHaveBeenCalledOnce();
  host.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]')!.click(); expect(dismiss).toHaveBeenCalledOnce(); expect(host.hidden).toBe(true);
});
it("writes once only for an explicitly fresh setting", async () => {
  let settings = parseSettings(FRESH_SETTINGS_JSON); const write = vi.fn(async () => {}), toast = vi.fn(), refresh = vi.fn();
  const model = createOnboarding({ get: () => settings, set: (next: Settings) => { settings = next; }, write, toast, refresh });
  model.mark(); model.mark(); expect(write).toHaveBeenCalledTimes(1); expect(settings.onboarding.hintDismissed).toBe(true);
  settings = parseSettings("broken"); createOnboarding({ get: () => settings, set: next => { settings = next; }, write, toast, refresh }).mark(); expect(write).toHaveBeenCalledTimes(1);
});
it("hides the hint and shows a generic toast when saving fails", async () => {
  let settings = parseSettings(FRESH_SETTINGS_JSON); const toast = vi.fn(), refresh = vi.fn();
  const model = createOnboarding({ get: () => settings, set: next => { settings = next; }, write: async () => { throw new Error("secret path"); }, toast, refresh });
  model.mark(); await Promise.resolve(); expect(model.dismissed()).toBe(true); expect(refresh).toHaveBeenCalled(); expect(toast).toHaveBeenCalledWith("Could not save this setting.");
});
