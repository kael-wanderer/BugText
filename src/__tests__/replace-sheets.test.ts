// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { showReplaceReview } from "../replace/review-sheet";
import { showReplaceResult } from "../replace/result-sheet";
import type { ReplacePreview } from "../replace/plan";
const bad = "<img src=x onerror=alert(1)>";
const preview: ReplacePreview = { files: [{ relative: bad, source: bad, matches: Array.from({ length: 46 }, () => ({ start: 0, end: 1, line: 1, line_text: bad, col_start: 0, col_end: 1, replacement: "x" })) }], skipped: [{ relative: "skip", reason: "binary" }], multiline: 0, too_many: false, cancelled: false };
afterEach(() => { document.body.innerHTML = ""; });
it("renders text safely, groups matches, updates selection and expands", async () => {
  const pending = showReplaceReview(preview, "a", "b", "Aa", () => "Open · unsaved");
  expect(document.querySelector("img")).toBeNull(); expect(document.body.textContent).toContain(bad); expect(document.body.textContent).toContain("Open · unsaved"); expect(document.body.textContent).toContain("1 file skipped");
  const inputs = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'); inputs[1].click(); expect(inputs[0].indeterminate).toBe(true); expect(document.body.textContent).toContain("Replace 45 matches in 1 file");
  const show = Array.from(document.querySelectorAll("button")).find(b => b.textContent === "Show all 46")!; show.click(); expect(document.querySelectorAll("label[hidden]")).toHaveLength(0);
  inputs[0].click(); inputs[0].click(); expect(Array.from(document.querySelectorAll("button")).find(b => b.textContent?.startsWith("Replace"))?.disabled).toBe(true);
  document.querySelector(".recovery-scrim")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); expect(await pending).toBeNull();
});
it("Enter applies and result offers undo", async () => { const pending = showReplaceReview(preview, "a", "b", "", () => "Open"); document.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); expect(await pending).not.toBeNull(); const undo = vi.fn(); showReplaceResult([{ path: "a", matches: 1 }], [{ path: bad, reason: "changed on disk" }], undo); expect(document.body.textContent).toContain("changed on disk"); expect(document.querySelector("img")).toBeNull(); Array.from(document.querySelectorAll("button")).find(b => b.textContent === "Undo replace")!.click(); expect(undo).toHaveBeenCalledOnce(); });
