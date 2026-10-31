// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createFocusMode } from "../focus/controller";
import { escapeExitsFocus, isFocusEligible } from "../focus/rules";
afterEach(() => { document.body.replaceChildren(); document.body.className = ""; vi.useRealTimers(); });
it("shows focus controls briefly and restores the captured view", () => {
  vi.useFakeTimers(); const saved = { topLine: 12, selection: { from: 3, to: 6 } }, restore = vi.fn();
  const focus = createFocusMode({ eligible: () => true, overlayOpen: () => false, captureView: () => saved, restoreView: restore, onChange: () => {}, toast: () => {}, exitHint: () => "⌃⌘Z" });
  focus.toggle(); expect(document.body.classList.contains("focus-active")).toBe(true); expect(document.body.textContent).toContain("Esc or ⌃⌘Z to exit");
  expect(document.querySelector('[aria-label="Exit focus mode"]')?.textContent).toBe("Exit Focus");
  vi.advanceTimersByTime(3000); expect(document.body.textContent).not.toContain("Esc or"); focus.toggle(); expect(restore).toHaveBeenCalledWith(saved); expect(document.body.classList.contains("focus-active")).toBe(false);
});
it("rejects unsupported views and exits when eligibility changes", () => {
  for (const pathOrName of ["file.pdf", "file.html"]) expect(isFocusEligible({ pathOrName, tableView: false, graphActive: false })).toBe(false);
  for (const flags of [{ tableView: true, graphActive: false }, { tableView: false, graphActive: true }]) expect(isFocusEligible({ pathOrName: "a.md", ...flags })).toBe(false);
  let eligible = false; const toast = vi.fn(); const deps = { eligible: () => eligible, overlayOpen: () => false, captureView: () => ({ topLine: 1, selection: { from: 0, to: 0 } }), restoreView: () => {}, onChange: () => {}, toast, exitHint: () => "" };
  const first = createFocusMode(deps), second = createFocusMode(deps); first.toggle(); expect(toast).toHaveBeenCalledWith("Focus mode works on Markdown and text notes.");
  eligible = true; first.toggle(); expect(first.active()).toBe(true); expect(second.active()).toBe(false); eligible = false; first.sync(); expect(first.active()).toBe(false);
});
it("only exits on unmodified, unhandled Escape without an overlay", () => {
  expect(escapeExitsFocus(new KeyboardEvent("keydown", { key: "Escape" }), false)).toBe(true);
  expect(escapeExitsFocus(new KeyboardEvent("keydown", { key: "Escape", shiftKey: true }), false)).toBe(false);
  expect(escapeExitsFocus(new KeyboardEvent("keydown", { key: "Escape" }), true)).toBe(false);
  const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true }); event.preventDefault(); expect(escapeExitsFocus(event, false)).toBe(false);
});
