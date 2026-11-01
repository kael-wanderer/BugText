import { describe, expect, it, vi } from "vitest";
import { applyTableEdit, type EditDeps } from "../table-view/edits";
import type { IndexedNote } from "../links/index";
import { readProperties } from "../properties/parse";
const source = "---\na: old # keep\nb: other\n---\nBody\n";
const note = (path = "/folder/a.md") => ({ path, source, properties: { a: "old", b: "other" } }) as unknown as IndexedNote;
function deps(): EditDeps { return { folder: "/folder", findOpen: () => null, read: async () => source, snapshot: vi.fn(), write: vi.fn() }; }
describe("table edits", () => {
  it("snapshots and writes only the changed value with an expected source", async () => {
    const d = deps();
    expect((await applyTableEdit([note()], { key: "a", value: "new" }, d)).changed).toEqual(["/folder/a.md"]);
    expect(d.snapshot).toHaveBeenCalledWith("/folder/a.md", source);
    expect(d.write).toHaveBeenCalledWith("/folder/a.md", source.replace("old", "new"), source);
  });
  it("guards stale, outside and invalid notes and limits the batch", async () => {
    const d = deps(); d.read = async () => "changed";
    expect((await applyTableEdit([note(), note("/other/a")], { key: "a", value: 1 }, d)).skipped.map(s => s.reason)).toEqual(["Changed on disk since the table loaded.", "Outside the open folder."]);
    expect((await applyTableEdit([{ ...note(), propertyError: { line: 1, message: "Invalid" } }], { key: "a", value: 1 }, deps())).skipped).toHaveLength(1);
    expect((await applyTableEdit(Array(501).fill(note()), { key: "a", value: 1 }, deps())).skipped).toHaveLength(501);
  });
  it("checks open values and applies one edit", async () => {
    const d = deps(), apply = vi.fn(); d.findOpen = () => ({ text: source, apply });
    expect((await applyTableEdit([note()], { key: "a", value: 4 }, d)).changed).toHaveLength(1);
    expect(apply).toHaveBeenCalledTimes(1);
    d.findOpen = () => ({ text: source.replace("old", "different"), apply });
    expect((await applyTableEdit([note()], { key: "a", value: 4 }, d)).skipped[0].reason).toBe("Changed since the table loaded.");
  });
  it("quotes hostile values and treats absent removals as no-ops", async () => {
    const d = deps(); await applyTableEdit([note()], { key: "a", value: "x\ny: z" }, d);
    const written = vi.mocked(d.write).mock.calls[0][1];
    expect(readProperties(written)).toEqual({ ok: true, props: { a: "x\ny: z", b: "other" } });
    expect((await applyTableEdit([note()], { key: "missing", value: undefined }, deps())).skipped).toEqual([]);
  });
});
