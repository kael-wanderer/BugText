import { describe, expect, it } from "vitest";
import { planExtraction, extractionReplacement, type SourceBinding } from "../notes/extract-plan";
import { inboxTaskChange, inboxTasks, noteTasks } from "../task-inbox/model";
import { applyPreset, DEFAULT_NOTE_TYPES, presetValues, singleChange, validNoteType } from "../note-types/model";
import type { IndexedNote } from "../links/index";
const binding = (text: string, from = 0, to = text.length): SourceBinding => ({ tabId: "a", revision: 2, path: "/notes/sub/source.md", text, from, to });
const note = (source: string): IndexedNote => ({ path: "/notes/a.md", source, headings: [], links: [], tags: ["project/a"], properties: null });
describe("extract selection", () => {
  it("creates beside source and preserves inline image destinations", () => {
    const source = binding("Text with ![photo](assets/a.png) and [note](b.md).\n");
    const plan = planExtraction(source, "/notes", "New note");
    expect(plan.dir).toBe("sub"); expect(plan.contents).toBe(source.text);
    expect(extractionReplacement(plan, "/notes/sub/New note 2.md").insert).toBe("[New note](<New note 2.md>)\n");
  });
  it("rebinds same-note heading links to their original source", () => {
    expect(planExtraction(binding("See [heading](#section).\n"), "/notes", "New").contents).toBe("See [heading](source.md#section).\n");
  });
  it("refuses unsafe selections, references and unsaved sources", () => {
    expect(() => planExtraction(binding("some words", 2, 6), "/notes", "New")).toThrow("complete lines");
    expect(() => planExtraction(binding("---\na: b\n---\n"), "/notes", "New")).toThrow("outside code");
    expect(() => planExtraction(binding("```\ncode\n```\n"), "/notes", "New")).toThrow("outside code");
    expect(() => planExtraction(binding("See [reference][ref].\n"), "/notes", "New")).toThrow("Reference-style");
    expect(() => planExtraction({ ...binding("text"), path: null }, "/notes", "New")).toThrow("Save");
  });
});
describe("task inbox", () => {
  it("ignores properties, fenced blocks, comments and collects parent headings", () => {
    const source = "---\ntasks: '- [ ] nope'\n---\n# Work\n- [ ] yes\n```\n- [ ] nope\n```\n<!--\n- [ ] nope\n-->\n- [x] done\n";
    const tasks = noteTasks(note(source)); expect(tasks.map(t => t.text)).toEqual(["yes", "done"]); expect(tasks[0].heading).toBe("Work");
    expect(inboxTasks([note(source)], { state: "incomplete", tag: "project", folder: "/notes" })).toHaveLength(1);
  });
  it("changes only the selected duplicate marker and refuses stale text", () => {
    const source = "- [ ] same\n- [ ] same\n";
    const task = noteTasks(note(source))[1]; const change = inboxTaskChange(task, source);
    expect(source.slice(0, change.from) + change.insert + source.slice(change.to)).toBe("- [ ] same\n- [x] same\n");
    expect(() => inboxTaskChange(task, "\n" + source)).toThrow("changed");
  });
});
describe("note type presets", () => {
  it("fills dates once and validates typed values", () => {
    expect(DEFAULT_NOTE_TYPES.every(validNoteType)).toBe(true);
    expect(presetValues(DEFAULT_NOTE_TYPES[0], new Date(2026, 9, 29)).date).toBe("2026-10-29");
    expect(validNoteType({ ...DEFAULT_NOTE_TYPES[0], template: "../secret.md" })).toBe(false);
  });
  it("fills missing fields while preserving existing comments and body", () => {
    const source = "---\nstatus: active # keep\ncustom: [a, b]\n---\n# Body\n";
    const result = applyPreset(source, { status: "planned", tags: ["work"] });
    expect(result.added).toEqual(["tags"]); expect(result.text).toContain("status: active # keep\ncustom: [a, b]"); expect(result.text).toContain("# Body\n");
  });
  it("refuses malformed YAML and unfinished frontmatter", () => {
    expect(() => applyPreset("---\na: [\n---\nBody", { tags: [] })).toThrow();
    expect(() => applyPreset("---\na: unfinished", { tags: [] })).toThrow();
  });
});

describe("note type apply keeps the rest of the note", () => {
  it("adds missing fields without touching comments, key order or body", () => {
    const before = "---\n# keep this comment\ntitle: Alpha\nzeta: 1\n---\nBody line one\nBody line two\n";
    const { text, added } = applyPreset(before, { status: "draft" }, true);
    expect(added).toEqual(["status"]);
    expect(text).toContain("# keep this comment\ntitle: Alpha\nzeta: 1\n");
    expect(text.endsWith("---\nBody line one\nBody line two\n")).toBe(true);
  });
  it("replaces only the changed span", () => {
    const before = "---\ntitle: Alpha\n---\nBody\n";
    const after = "---\ntitle: Alpha\nstatus: draft\n---\nBody\n";
    const change = singleChange(before, after);
    expect(change.from).toBeGreaterThan(0);
    expect(change.to).toBeLessThanOrEqual(before.indexOf("---\nBody"));
    expect(before.slice(0, change.from) + change.insert + before.slice(change.to)).toBe(after);
  });
  it("returns an empty change when nothing differs", () => {
    expect(singleChange("same", "same")).toEqual({ from: 4, to: 4, insert: "" });
  });
});
