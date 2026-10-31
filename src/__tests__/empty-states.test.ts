// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { emptyState, searchEmpty } from "../empty-states/views";
it("builds accessible action buttons and omits empty hints", () => {
  const run = vi.fn(), root = emptyState("Empty", null, [{ label: "New", hint: "⌘N", run }, { label: "Other", hint: "", run }]);
  const buttons = root.querySelectorAll("button"); expect([...buttons].every(button => button.type === "button")).toBe(true);
  expect(buttons[0].querySelector("kbd")?.textContent).toBe("⌘N"); expect(buttons[1].querySelector("kbd")).toBeNull();
  buttons[0].click(); buttons[1].click(); expect(run).toHaveBeenCalledTimes(2);
});
it("shows glob controls only when active and renders untrusted text literally", () => {
  const text = "<img src=x onerror=alert(1)>";
  const root = searchEmpty(text, true, () => {}, () => {});
  expect(root.textContent).toContain(text); expect(root.querySelector("img")).toBeNull();
  expect(root.textContent).toContain("Clear file filters"); expect(root.textContent).toContain("narrowing this search");
  expect(searchEmpty(text, false, () => {}, () => {}).textContent).not.toContain("Clear file filters");
  const state = emptyState(text, null, []); expect(state.textContent).toBe(text); expect(state.querySelector("img")).toBeNull();
});
