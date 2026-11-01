// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createFocusPill } from "../writing-goals/pill";
it("shows progress, opens goals, and fades while typing", () => {
  vi.useFakeTimers(); const host = document.createElement("div"), click = vi.fn(); const pill = createFocusPill(host, click);
  const button = host.querySelector("button")!; pill.update(null); expect(button.hidden).toBe(true);
  pill.update({ words: 820, goal: 1500, session: false }); expect(button.textContent).toBe("820 / 1,500"); expect(button.querySelector("svg")).toBeTruthy();
  button.click(); expect(click).toHaveBeenCalledWith(button); pill.typing(); expect(button.classList.contains("typing")).toBe(true);
  vi.advanceTimersByTime(2000); expect(button.classList.contains("typing")).toBe(false); vi.useRealTimers();
});
