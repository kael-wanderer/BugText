import { describe, expect, it } from "vitest";
import { initialPlan, movePages, rotatePages, deletePages, insertPages, isChanged, changeSummary, historyPush, historyUndo, historyRedo } from "../pdf-pages/plan";
describe("page plans", () => {
  it("moves selections in order across gaps and counts moved pages", () => {
    const start = initialPlan(5); const end = movePages(start, ["self:1", "self:3"], 5);
    expect(end.pages.map(p => p.index)).toEqual([0, 2, 4, 1, 3]);
    expect(movePages(end, ["self:1", "self:3"], 0).pages.map(p => p.index)).toEqual([1, 3, 0, 2, 4]);
    expect(changeSummary(end, 5).moved).toBe(4);
  });
  it("rotates, refuses deleting all pages, and supports undo and redo", () => {
    const start = initialPlan(2); let next = start;
    for (let i = 0; i < 4; i++) next = rotatePages(next, ["self:0"], 90);
    expect(isChanged(next)).toBe(false);
    expect(rotatePages(start, ["self:0"], -90).pages[0].rotation).toBe(270);
    expect(deletePages(start, ["self:0", "self:1"])).toEqual({ error: "A PDF needs at least one page." });
    const history = historyPush({ past: [], present: start, future: [] }, rotatePages(start, ["self:0"], 90));
    expect(isChanged(historyUndo(history).present)).toBe(false);
    expect(historyRedo(historyUndo(history)).present).toEqual(history.present);
  });
  it("inserts repeated sources with unique keys", () => {
    const insert = { id: "insert", name: "a.pdf", path: "/a.pdf", bytes: new Uint8Array(), pageCount: 2 };
    const plan = insertPages(insertPages(initialPlan(1), insert, 0), insert, 3);
    expect(new Set(plan.pages.map(p => p.key)).size).toBe(5);
    expect(changeSummary(plan, 1)).toEqual({ moved: 0, rotated: 0, deleted: 0, inserted: 4 });
  });
});
