// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { showToast } from "../toast";
it("exposes a keyboard-reachable toast action", () => {
  const run = vi.fn();
  showToast("Discarded note", 8000, { label: "Undo", run });
  const button = document.querySelector<HTMLButtonElement>(".app-toast button")!;
  expect(button.textContent).toBe("Undo");
  button.click();
  expect(run).toHaveBeenCalledOnce();
});
