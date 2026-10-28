// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { undo } from "@codemirror/commands";
import { createEditor } from "../editor";
import { DEFAULT_SETTINGS } from "../settings";
import { addQuickNote, formatEntry, resolveTarget, type QuickNoteDeps } from "../templates/quick-note";

Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

const NOW = new Date(2026, 9, 28, 14, 32);
const DAILY = "<!-- template\nfolder: journal\nname: {{date}}\n-->\n# {{date}}\n\n## Log\n{{cursor}}\n";

function deps(overrides: Partial<QuickNoteDeps> = {}): QuickNoteDeps {
  return {
    folder: "/notes",
    settings: { ...DEFAULT_SETTINGS.templates },
    now: () => NOW,
    dailyTemplate: async () => DAILY,
    findOpen: () => null,
    appendToTab: vi.fn(),
    exists: async () => true,
    create: vi.fn(async (args) => `/notes/${args.relativeDir}/${args.stem}.md`),
    append: vi.fn(async (folder, relative) => `${folder}/${relative}`),
    recordStat: vi.fn(async () => {}),
    afterWrite: vi.fn(),
    refreshExplorer: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("formatEntry", () => {
  it("prefixes the time", () => {
    expect(formatEntry(NOW, "Ask Linh")).toBe("- 14:32 Ask Linh");
  });
  it("indents continuation lines by two spaces and drops trailing blanks", () => {
    expect(formatEntry(NOW, "one\ntwo\n\nthree\n\n")).toBe("- 14:32 one\n  two\n\n  three");
  });
});

describe("resolveTarget", () => {
  it("takes the daily note destination from the template header", async () => {
    const target = await resolveTarget(deps());
    expect(target).toMatchObject({ relative: "journal/2026-10-28.md", dir: "journal", stem: "2026-10-28" });
  });
  it("falls back to journal/{{date}} without a template", async () => {
    const target = await resolveTarget(deps({ dailyTemplate: async () => null }));
    expect(target).toMatchObject({ relative: "journal/2026-10-28.md", initial: "# 2026-10-28\n" });
  });
  it("uses the inbox file", async () => {
    const settings = { ...DEFAULT_SETTINGS.templates, quickTarget: "inbox" as const };
    expect(await resolveTarget(deps({ settings }))).toMatchObject({ relative: "Inbox.md", initial: "" });
  });
  it("refuses an inbox outside the open folder", async () => {
    const settings = { ...DEFAULT_SETTINGS.templates, quickTarget: "inbox" as const, inboxFile: "../x.md" };
    expect(await resolveTarget(deps({ settings }))).toEqual({ error: "Template folder must be inside the open folder." });
  });
});

describe("addQuickNote", () => {
  const target = { relative: "journal/2026-10-28.md", dir: "journal", stem: "2026-10-28", initial: "# 2026-10-28\n\n## Log\n" };

  it("appends on disk then records the stat when the note is closed", async () => {
    const d = deps();
    const path = await addQuickNote(d, "hello", target);
    expect(d.append).toHaveBeenCalledWith("/notes", "journal/2026-10-28.md", "- 14:32 hello");
    expect(d.recordStat).toHaveBeenCalledWith("/notes/journal/2026-10-28.md");
    expect(d.afterWrite).toHaveBeenCalled();
    expect(d.appendToTab).not.toHaveBeenCalled();
    expect(path).toBe("/notes/journal/2026-10-28.md");
  });

  it("creates a missing daily note from the template with the entry in one write", async () => {
    const d = deps({ exists: async () => false });
    await addQuickNote(d, "hello", target);
    expect(d.create).toHaveBeenCalledWith({ folder: "/notes", relativeDir: "journal", stem: "2026-10-28", contents: "# 2026-10-28\n\n## Log\n- 14:32 hello\n" });
    expect(d.append).not.toHaveBeenCalled();
    expect(d.recordStat).toHaveBeenCalled();
    expect(d.refreshExplorer).toHaveBeenCalled();
  });

  it("appends to the open tab and writes nothing", async () => {
    const d = deps({ findOpen: () => ({ tabId: "t1", text: "# Day" }) });
    await addQuickNote(d, "hello", target);
    expect(d.appendToTab).toHaveBeenCalledTimes(1);
    expect(d.appendToTab).toHaveBeenCalledWith("t1", "\n- 14:32 hello\n");
    expect(d.append).not.toHaveBeenCalled();
    expect(d.create).not.toHaveBeenCalled();
    expect(d.recordStat).not.toHaveBeenCalled();
  });

  it("creates a missing inbox through append", async () => {
    const d = deps({ exists: async () => false });
    await addQuickNote(d, "x", { relative: "Inbox.md", dir: "", stem: "Inbox", initial: "" });
    expect(d.append).toHaveBeenCalledWith("/notes", "Inbox.md", "- 14:32 x");
    expect(d.create).not.toHaveBeenCalled();
  });
});

describe("editor appendText", () => {
  function setup(text: string) {
    const parent = document.createElement("div");
    document.body.append(parent);
    const onChange = vi.fn();
    const editor = createEditor(parent, onChange);
    editor.openState("a", text, "markdown");
    editor.openState("b", text, "markdown");
    editor.switchTo("a");
    return { editor, onChange };
  }

  it("appends to the active document as one undo step", async () => {
    const { editor, onChange } = setup("# Day");
    editor.appendText("a", "\n- 14:32 x\n");
    expect(editor.getText("a")).toBe("# Day\n- 14:32 x\n");
    expect(onChange).toHaveBeenCalled();
    const { EditorView } = await import("@codemirror/view");
    const view = EditorView.findFromDOM(document.querySelector<HTMLElement>(".cm-editor")!)!;
    undo(view);
    expect(editor.getText("a")).toBe("# Day");
  });

  it("appends to an inactive document and reports the change", () => {
    const { editor, onChange } = setup("# Day");
    onChange.mockClear();
    editor.appendText("b", "\nmore\n");
    expect(editor.getText("b")).toBe("# Day\nmore\n");
    expect(onChange).toHaveBeenCalledWith("b", "# Day\nmore\n");
  });
});
