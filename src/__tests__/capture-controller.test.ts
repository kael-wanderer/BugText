// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCapture, type CaptureHost } from "../capture/controller";
import { DEFAULT_SETTINGS, type Settings } from "../settings";
import type { CaptureWriteDeps } from "../capture/write";

const SOURCE = "# Architecture\n\n## Sync model\n\nThe sync runs every minute.\n";

function setup(overrides: Partial<CaptureHost> = {}) {
  let settings: Settings = structuredClone(DEFAULT_SETTINGS);
  const files = new Map<string, string>();
  const writer: CaptureWriteDeps = {
    folder: "/r",
    findOpen: () => null,
    appendToTab: vi.fn(),
    exists: async (path) => files.has(path),
    read: async (path) => files.get(path) ?? "",
    snapshot: vi.fn().mockResolvedValue(undefined),
    append: vi.fn(async (folder, relative, text) => { const path = `${folder}/${relative}`; files.set(path, (files.get(path) ?? "") + text); return path; }),
    create: vi.fn(async ({ folder, relativeDir, stem, contents }) => { const path = `${folder}/${relativeDir ? `${relativeDir}/` : ""}${stem}.md`; files.set(path, contents); return path; }),
    recordStat: vi.fn().mockResolvedValue(undefined),
    afterWrite: vi.fn(),
    refreshExplorer: vi.fn().mockResolvedValue(undefined),
  };
  const host: CaptureHost = {
    doc: document,
    active: () => ({ folder: "/r", path: "/r/docs/arch.md", text: SOURCE, passage: { quote: "The sync runs", line: 5, endLine: 5, source: "preview" } }),
    writer: () => writer,
    settings: () => settings,
    saveSettings: vi.fn((next: Settings) => { settings = next; }),
    noteFiles: () => ["docs/arch.md", "inbox.md"],
    openInSub: vi.fn().mockResolvedValue(undefined),
    copy: vi.fn().mockResolvedValue(undefined),
    ask: vi.fn(),
    toast: vi.fn(),
    written: vi.fn(),
    now: () => new Date(2026, 10, 14, 9, 30),
    ...overrides,
  };
  return { host, files, writer, capture: createCapture(host), settings: () => settings };
}
const save = () => document.querySelector<HTMLFormElement>("form.capture-sheet")!.requestSubmit();

afterEach(() => document.body.replaceChildren());

describe("capture controller", () => {
  it("saves an excerpt to a new companion note and offers to open it", async () => {
    const t = setup();
    const done = t.capture.run("excerpt");
    await Promise.resolve();
    expect(document.querySelector(".capture-hint")?.textContent).toBe("arch.notes.md, beside the document");
    save();
    await done;
    expect(t.files.get("/r/docs/arch.notes.md")).toBe(
      "---\nabout: \"arch.md\"\n---\n\n# Notes on Architecture\n\n> The sync runs\n> — [Architecture › Sync model](arch.md#sync-model) · 2026-11-14\n",
    );
    const [text, action] = vi.mocked(t.host.toast).mock.calls[0];
    expect(text).toBe("Saved to arch.notes.md");
    action!.run();
    expect(t.host.openInSub).toHaveBeenCalledWith("/r/docs/arch.notes.md");
    expect(t.host.written).toHaveBeenCalledWith("/r/docs/arch.notes.md");
    expect(t.host.saveSettings).not.toHaveBeenCalled(); // the default target needs no write
  });
  it("saves a task to the daily note and remembers a changed target", async () => {
    const t = setup();
    const done = t.capture.run("task");
    await Promise.resolve();
    document.querySelector<HTMLInputElement>("input.capture-task")!.value = "Check the sync";
    save();
    await done;
    expect(t.files.get("/r/Daily/2026-11-14.md")).toContain("- [ ] Check the sync ([source](../docs/arch.md#sync-model))\n");
    expect(t.host.saveSettings).not.toHaveBeenCalled();
  });
  it("remembers a changed target and writes settings only when it changes", async () => {
    const t = setup();
    const pick = async () => {
      const done = t.capture.run("task");
      await Promise.resolve();
      return done;
    };
    let done = pick();
    await Promise.resolve();
    document.querySelector<HTMLInputElement>('input[name="capture-target"][value="note"]')!.click();
    await Promise.resolve();
    [...document.querySelectorAll<HTMLLIElement>(".capture-picker li")].find((li) => li.textContent === "inbox.md")!.click();
    await new Promise((r) => setTimeout(r, 0));
    save();
    await done;
    expect(t.settings().capture.targets["/r"]?.task).toEqual({ kind: "note", relative: "inbox.md" });
    expect(t.host.saveSettings).toHaveBeenCalledTimes(1);
    done = pick();
    await Promise.resolve(); await Promise.resolve();
    save();
    await done;
    expect(t.host.saveSettings).toHaveBeenCalledTimes(1);
  });
  it("closes a code fence an editor selection left open", async () => {
    const t = setup({ active: () => ({ folder: "/r", path: "/r/docs/arch.md", text: SOURCE, passage: { quote: "```ts\nconst a = 1;", line: 5, endLine: 6, source: "editor" } }) });
    const done = t.capture.run("excerpt");
    await Promise.resolve();
    save();
    await done;
    expect(t.files.get("/r/docs/arch.notes.md")).toContain("> ```ts\n> const a = 1;\n> ```\n> — [");
  });
  it("escapes text selected in the preview and keeps editor text as written", async () => {
    const preview = setup({ active: () => ({ folder: "/r", path: "/r/docs/arch.md", text: SOURCE, passage: { quote: "Map<K> for *args", line: 5, endLine: 5, source: "preview" } }) });
    let done = preview.capture.run("excerpt");
    await Promise.resolve();
    save();
    await done;
    expect(preview.files.get("/r/docs/arch.notes.md")).toContain("> Map\\<K\\> for \\*args\n");
    const editor = setup({ active: () => ({ folder: "/r", path: "/r/docs/arch.md", text: SOURCE, passage: { quote: "`Map<K>` for *args*", line: 5, endLine: 5, source: "editor" } }) });
    done = editor.capture.run("task");
    await Promise.resolve();
    save();
    await done;
    expect(editor.files.get("/r/Daily/2026-11-14.md")).toContain("- [ ] `Map<K>` for *args* ([source]");
  });
  it("tells the owner when a created note landed on another name", async () => {
    const t = setup();
    vi.mocked(t.writer.create).mockResolvedValueOnce("/r/docs/arch.notes 2.md");
    const done = t.capture.run("excerpt");
    await Promise.resolve();
    save();
    await done;
    expect(t.host.toast).toHaveBeenCalledWith("The note was created by another app meanwhile; your entry is in arch.notes 2.md.");
    expect(t.host.openInSub).toHaveBeenCalledWith("/r/docs/arch.notes 2.md");
  });
  it("refuses a note outside the open folder", async () => {
    const t = setup({ active: () => ({ folder: null, path: "/x/a.md", text: "a", passage: { quote: "a", line: 1, endLine: 1, source: "editor" } }) });
    await t.capture.run("excerpt");
    expect(t.host.toast).toHaveBeenCalledWith("Open the note from a folder to save excerpts.");
    expect(document.querySelector(".capture-sheet")).toBeNull();
  });
  it("does nothing without a passage, and writes nothing on Cancel", async () => {
    const t = setup({ active: () => ({ folder: "/r", path: "/r/a.md", text: "a", passage: null }) });
    await t.capture.run("excerpt");
    expect(document.querySelector(".capture-sheet")).toBeNull();
    const u = setup();
    const done = u.capture.run("excerpt");
    await Promise.resolve();
    document.querySelector<HTMLButtonElement>(".capture-cancel")!.click();
    await done;
    expect(u.files.size).toBe(0);
    expect(u.host.saveSettings).not.toHaveBeenCalled();
  });
  it("copies a link relative to the folder root", async () => {
    const t = setup();
    await t.capture.run("copy");
    expect(t.host.copy).toHaveBeenCalledWith("[Architecture › Sync model](docs/arch.md#sync-model)");
    expect(t.host.toast).toHaveBeenCalledWith("Link copied");
  });
  it("hands the passage to Ask AI", async () => {
    const t = setup();
    await t.capture.run("ask");
    expect(t.host.ask).toHaveBeenCalledWith({ quote: "The sync runs", line: 5, endLine: 5, source: "preview" });
  });
  it("Notes button creates the companion note with its starter, then opens it", async () => {
    const t = setup();
    await t.capture.openNotes();
    expect(t.files.get("/r/docs/arch.notes.md")).toBe("---\nabout: \"arch.md\"\n---\n\n# Notes on Architecture\n\n");
    expect(t.host.openInSub).toHaveBeenCalledWith("/r/docs/arch.notes.md");
    vi.mocked(t.writer.create).mockClear();
    await t.capture.openNotes();
    expect(t.writer.create).not.toHaveBeenCalled();
  });
  it("Add note takes the HTML page's <title> when it has one", async () => {
    const t = setup({ active: () => ({ folder: "/r", path: "/r/site/page.html", text: "<html><head><title>Field &amp; Notes</title></head><h1>Page</h1></html>", passage: null }) });
    const done = t.capture.addNote();
    await Promise.resolve();
    save();
    await done;
    expect(t.files.get("/r/site/page.notes.md")).toBe("---\nabout: \"page.html\"\n---\n\n# Notes on Field & Notes\n\n**2026-11-14** — [Field & Notes](page.html)\n");
  });
  it("Add note writes a dated entry to the companion of an HTML file", async () => {
    const t = setup({ active: () => ({ folder: "/r", path: "/r/site/page.html", text: "<h1>Page</h1>", passage: null }) });
    const done = t.capture.addNote();
    await Promise.resolve();
    document.querySelector<HTMLTextAreaElement>("textarea.capture-comment")!.value = "Read later";
    save();
    await done;
    expect(t.files.get("/r/site/page.notes.md")).toBe("---\nabout: \"page.html\"\n---\n\n# Notes on page\n\n**2026-11-14** — [page](page.html)\n\nRead later\n");
  });
});
