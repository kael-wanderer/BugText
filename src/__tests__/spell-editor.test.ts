// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../spell/api", () => ({ checkSpelling: vi.fn(async () => []), suggestSpelling: vi.fn(), ignoreSpelling: vi.fn(), learnSpelling: vi.fn() }));
import { checkSpelling } from "../spell/api";
import { createEditor } from "../editor";
import { spellCache } from "../spell/cache";
afterEach(() => { vi.useRealTimers(); spellCache.clear(); vi.clearAllMocks(); document.body.replaceChildren(); });
it("keeps browser spelling off and never checks unsupported document kinds", async () => {
  vi.useFakeTimers(); const parent = document.createElement("div"); document.body.append(parent);
  const editor = createEditor(parent, () => {});
  for (const kind of ["html", "json", "yaml", "javascript", "typescript", "sql"] as const) {
    editor.openState(kind, "recieve", kind); await vi.advanceTimersByTimeAsync(350);
    expect(parent.querySelector(".cm-content")?.getAttribute("spellcheck")).toBe("false");
  }
  expect(checkSpelling).not.toHaveBeenCalled();
});
