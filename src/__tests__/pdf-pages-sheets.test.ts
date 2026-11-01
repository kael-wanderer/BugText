// @vitest-environment jsdom
import { expect, it } from "vitest";
import { confirmOrganizedSave, pendingEdits } from "../pdf-pages/sheets";
it("describes singular losses, signatures and changed files", async () => {
  const pending = confirmOrganizedSave({ fileName: "<evil>.pdf", pages: 3, summary: { moved: 1, rotated: 1, deleted: 1, inserted: 0 }, removedHighlights: 1, pruned: { bookmarks: 1, links: 1, fields: 0 }, signed: true, changedOnDisk: true });
  expect(document.body.textContent).toContain("changed on disk"); expect(document.body.textContent).toContain("1 highlight is"); expect(document.body.textContent).toContain("1 bookmark and 1 link"); expect(document.body.textContent).toContain("digitally signed");
  Array.from(document.querySelectorAll("button")).find(b => b.textContent === "Save Anyway")!.click(); expect(await pending).toBe(true);
});
it("cancels pending edits with Escape", async () => {
  const result = pendingEdits(); document.querySelector(".recovery-scrim")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); expect(await result).toBe("cancel");
});
