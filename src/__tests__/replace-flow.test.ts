// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createReplaceFlow } from "../replace/flow";
import type { ReplacePreview } from "../replace/plan";
import { KEYMAP_COMMANDS, conflictingIds } from "../keymap";
const match = { start: 0, end: 3, line: 1, line_text: "cat", col_start: 0, col_end: 3, replacement: "dog" };
const preview: ReplacePreview = { files: [{ relative: "open.md", source: "cat", matches: [match] }, { relative: "closed.md", source: "cat", matches: [match] }], skipped: [], multiline: 0, too_many: false, cancelled: false };
it("routes live buffers and atomic writes through the replace flow and invalidates old undo", async () => {
  let text = "cat", oldUndo = () => {}; const invalidate = vi.fn(), snapshot = vi.fn(async () => {}), refresh = vi.fn();
  const invoke = vi.fn(async (command: string, args: Record<string, unknown>) => command === "replace_preview" ? preview : args) as unknown as <T>(command: string, args: Record<string, unknown>) => Promise<T>;
  const write = vi.fn(async (path: string, contents: string, expected: string) => { await invoke("write_file_atomic", { path, contents, expected, folder: "/root" }); });
  const flow = createReplaceFlow({ folder: () => "/root", tabs: () => [{ path: "/root/open.md", text, dirty: true }], invoke,
    writer: () => ({ findOpen: p => p.endsWith("open.md") ? { text, apply: changes => { text = changes.reduceRight((s, c) => s.slice(0, c.from) + c.insert + s.slice(c.to), text); } } : null, read: async () => "cat", snapshot, write, folderStillOpen: () => true }),
    review: async () => [[true], [true]], result: (_changed, _failures, undo) => { oldUndo = undo; return invalidate; }, refresh });
  const options = { caseSensitive: true, wholeWord: false, regex: false };
  const data = await flow.preview("cat", "dog", options, ["open.md", "closed.md"]);
  expect(invoke).toHaveBeenCalledWith("replace_preview", expect.objectContaining({ request: expect.objectContaining({ overrides: { "open.md": "cat" } }) }));
  await flow.show(data, "cat", "dog", options); expect(text).toBe("dog"); expect(snapshot).toHaveBeenCalledWith("/root/closed.md", "cat", "Before replace “cat” → “dog”");
  expect(invoke).toHaveBeenCalledWith("write_file_atomic", { path: "/root/closed.md", contents: "dog", expected: "cat", folder: "/root" });
  const previousUndo = oldUndo; await flow.show({ ...preview, files: [] }, "cat", "dog", options); expect(invalidate).toHaveBeenCalled(); previousUndo(); expect(text).toBe("dog"); expect(refresh).toHaveBeenCalled();
});
it("registers a conflict-free Replace in Folder shortcut", () => { expect(KEYMAP_COMMANDS.find(c => c.id === "search.replace_in_folder")).toMatchObject({ default: "CmdOrCtrl+Alt+F", scope: "app" }); expect(conflictingIds({}).has("search.replace_in_folder")).toBe(false); });
