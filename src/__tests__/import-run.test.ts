// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { importFile, importWeb, type ImportDeps, type ImportUI } from "../import/run";
import { loadProperties } from "../properties/loader";
import type { IndexedNote } from "../links/index";

const { readProperties } = await loadProperties();
const OUTSIDE = "The output path must be a Markdown note inside this folder.";

type Answer = Awaited<ReturnType<ImportUI["ask"]>>;

function setup(options: { answers?: Answer[]; notes?: IndexedNote[]; html?: string; markdown?: string } = {}) {
  const calls: string[] = [];
  const answers = [...(options.answers ?? [])];
  const deps: ImportDeps = {
    folder: () => "/f",
    activeRelative: () => "research/x.md",
    imagesFolder: () => "assets",
    today: () => "2026-11-15",
    notes: () => options.notes ?? [],
    pickFile: vi.fn(async (kind) => (calls.push(`pick:${kind}`), kind === "word" ? "/src/report.docx" : "/src/data.csv")),
    fetchPage: vi.fn(async (address) => {
      calls.push(`fetch:${address}`);
      return { url: "https://e.com/final/", html: options.html ?? "<main><h1>T</h1><p>text</p></main>", digest: "d1" };
    }),
    htmlToMarkdown: vi.fn(async (html) => (calls.push("convert"), options.markdown ?? `converted:${html}`)),
    probe: vi.fn(async (path, kind) => {
      calls.push(`probe:${kind}`);
      const name = path.split("/").pop()!;
      return { name, stem: name.replace(/\.\w+$/, ""), bytes: 10, digest: "fd" };
    }),
    readCsv: vi.fn(async () => (calls.push("read"), "a,b\n1,2\n")),
    copyOriginal: vi.fn(async (args) => (calls.push("copy"), { link: `assets/originals/${args.path.split("/").pop()}` })),
    word: vi.fn(async () => (calls.push("word"), { markdown: "# W\n", problems: ["fake.png is not a valid image."] })),
    create: vi.fn(async (args) => (calls.push("create"), `/f/${args.relativeDir ? `${args.relativeDir}/` : ""}${args.stem}.md`)),
    created: vi.fn(),
    open: vi.fn(),
  };
  const ui = {
    ask: vi.fn(async () => (calls.push("ask"), answers.shift() ?? null)),
    busy: vi.fn(),
    result: vi.fn(),
    fail: vi.fn(),
  } satisfies ImportUI;
  return { deps, ui, calls };
}

function written(deps: ImportDeps): { relativeDir: string; stem: string; contents: string } {
  return vi.mocked(deps.create).mock.calls[0][0];
}

function note(path: string, properties: Record<string, unknown>): IndexedNote {
  return { path, source: "", links: [], headings: [], tags: [], properties };
}

describe("importWeb", () => {
  it("needs an open folder", async () => {
    const { deps, ui } = setup();
    deps.folder = () => null;
    await importWeb(deps, ui);
    expect(ui.fail).toHaveBeenCalledWith("Open a folder to import into.");
    expect(ui.ask).not.toHaveBeenCalled();
  });

  it("fetches, cleans, converts and creates the note", async () => {
    const { deps, ui, calls } = setup({ answers: [{ address: "https://e.com/a#frag", savePath: "research/a.md", again: false }] });
    await importWeb(deps, ui);
    expect(ui.ask).toHaveBeenCalledWith(expect.objectContaining({ kind: "web", earlier: null }));
    expect(calls).toEqual(["ask", "fetch:https://e.com/a#frag", "convert", "create"]);
    const converted = vi.mocked(deps.htmlToMarkdown).mock.calls[0][0];
    expect(converted).toContain("<h1>T</h1>");
    expect(converted).not.toContain("<main>");
    const args = written(deps);
    expect(args.relativeDir).toBe("research");
    expect(args.stem).toBe("a");
    expect(readProperties(args.contents)).toEqual({
      ok: true,
      props: { title: "T", source: "https://e.com/a", imported_at: "2026-11-15", source_digest: "d1" },
    });
    expect(deps.created).toHaveBeenCalledWith("/f/research/a.md", args.contents);
    expect(ui.result).toHaveBeenCalledWith({ path: "/f/research/a.md", problems: [] });
  });

  it("adds the page title as a property and names an empty save path after it", async () => {
    const { deps, ui } = setup({
      html: "<title>Queue: patterns</title><p>x</p>",
      answers: [{ address: "https://e.com/a", savePath: "", again: false }],
    });
    await importWeb(deps, ui);
    const args = written(deps);
    expect(args.relativeDir).toBe("research");
    expect(args.stem).toBe("Queue patterns");
    expect(readProperties(args.contents)).toMatchObject({ ok: true, props: { title: "Queue: patterns" } });
  });

  it("asks again before fetching when the address was imported before", async () => {
    const notes = [note("/f/old.md", { source: "https://e.com/a", imported_at: "2026-11-01" })];
    const first = { address: "https://e.com/a", savePath: "a.md", again: false };
    const open = setup({ notes, answers: [first, { open: "/f/old.md" }] });
    await importWeb(open.deps, open.ui);
    expect(open.ui.ask).toHaveBeenLastCalledWith(expect.objectContaining({ earlier: { path: "/f/old.md", importedAt: "2026-11-01" } }));
    expect(open.deps.open).toHaveBeenCalledWith("/f/old.md");
    expect(open.calls).toEqual(["ask", "ask"]);

    const again = setup({ notes, answers: [first, { address: "https://e.com/a", savePath: "a.md", again: true }] });
    await importWeb(again.deps, again.ui);
    expect(again.calls).toEqual(["ask", "ask", "fetch:https://e.com/a", "convert", "create"]);
  });

  it("asks again when the fetched page matches an earlier digest", async () => {
    const notes = [note("/f/old.md", { source: "https://other.com/", source_digest: "d1" })];
    const { deps, ui, calls } = setup({ notes, answers: [{ address: "https://e.com/a", savePath: "a.md", again: false }, null] });
    await importWeb(deps, ui);
    expect(calls).toEqual(["ask", "fetch:https://e.com/a", "ask"]);
    expect(ui.ask).toHaveBeenLastCalledWith(expect.objectContaining({ earlier: { path: "/f/old.md", importedAt: null } }));
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("counts the web images that reach the note", async () => {
    const three = setup({
      markdown: "![a](https://e.com/1.png) ![b](<https://e.com/2 x.png>)\n\n![](https://e.com/3.png)\n[link](https://e.com/)\n",
      answers: [{ address: "https://e.com/a", savePath: "a.md", again: false }],
    });
    await importWeb(three.deps, three.ui);
    expect(three.ui.result).toHaveBeenCalledWith({ path: "/f/a.md", problems: ["3 images stay linked to the web."] });
    const one = setup({ markdown: "text ![x](https://e.com/1.png)\n", answers: [{ address: "https://e.com/a", savePath: "a.md", again: false }] });
    await importWeb(one.deps, one.ui);
    expect(one.ui.result).toHaveBeenCalledWith({ path: "/f/a.md", problems: ["1 image stays linked to the web."] });
    const none = setup({ html: `<p>x</p><img src="https://e.com/1.png">`, markdown: "x\n", answers: [{ address: "https://e.com/a", savePath: "a.md", again: false }] });
    await importWeb(none.deps, none.ui);
    expect(none.ui.result).toHaveBeenCalledWith({ path: "/f/a.md", problems: [] });
  });

  it("refuses a page with no text", async () => {
    const { deps, ui } = setup({ markdown: "  \n", answers: [{ address: "https://e.com/a", savePath: "a.md", again: false }] });
    await importWeb(deps, ui);
    expect(ui.fail).toHaveBeenCalledWith("The page has no text to import.");
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("shows a fetch error and creates nothing", async () => {
    const { deps, ui } = setup({ answers: [{ address: "https://10.0.0.1/", savePath: "a.md", again: false }] });
    deps.fetchPage = vi.fn(async () => Promise.reject("This address is not on the public internet."));
    await importWeb(deps, ui);
    expect(ui.fail).toHaveBeenCalledWith("This address is not on the public internet.");
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("checks the save path before fetching", async () => {
    for (const savePath of ["../x.md", "/tmp/x.md", "x.txt"]) {
      const { deps, ui } = setup({ answers: [{ address: "https://e.com/a", savePath, again: false }] });
      await importWeb(deps, ui);
      expect(ui.fail).toHaveBeenCalledWith(OUTSIDE);
      expect(deps.fetchPage).not.toHaveBeenCalled();
    }
    const { deps, ui } = setup({ answers: [{ address: "https://e.com/a", savePath: "notes/page", again: false }] });
    await importWeb(deps, ui);
    expect(written(deps)).toMatchObject({ relativeDir: "notes", stem: "page" });
  });
});

describe("importFile", () => {
  it("imports a Word document", async () => {
    const { deps, ui, calls } = setup({ answers: [{ savePath: "research/report.md", again: false }] });
    await importFile("word", deps, ui);
    expect(calls).toEqual(["pick:word", "probe:word", "ask", "copy", "word", "create"]);
    expect(ui.ask).toHaveBeenCalledWith(expect.objectContaining({ kind: "word", savePath: "research/report.md", earlier: null }));
    expect(deps.copyOriginal).toHaveBeenCalledWith({ folder: "/f", relativeDir: "research", imagesFolder: "assets", path: "/src/report.docx", kind: "word" });
    const args = written(deps);
    expect(readProperties(args.contents)).toEqual({
      ok: true,
      props: { source: "assets/originals/report.docx", imported_at: "2026-11-15", source_digest: "fd" },
    });
    expect(args.contents).toContain("# W\n");
    expect(ui.result).toHaveBeenCalledWith({ path: "/f/research/report.md", problems: ["fake.png is not a valid image."] });
  });

  it("offers an earlier import of the same file", async () => {
    const notes = [note("/f/r.md", { source_digest: "fd", imported_at: "2026-11-02" })];
    const { deps, ui } = setup({ notes, answers: [{ open: "/f/r.md" }] });
    await importFile("word", deps, ui);
    expect(ui.ask).toHaveBeenCalledWith(expect.objectContaining({ earlier: { path: "/f/r.md", importedAt: "2026-11-02" } }));
    expect(deps.open).toHaveBeenCalledWith("/f/r.md");
    expect(deps.copyOriginal).not.toHaveBeenCalled();
  });

  it("does nothing when the picker or the sheet is cancelled", async () => {
    const picker = setup();
    picker.deps.pickFile = vi.fn(async () => null);
    await importFile("word", picker.deps, picker.ui);
    expect(picker.deps.probe).not.toHaveBeenCalled();
    const sheet = setup({ answers: [null] });
    await importFile("word", sheet.deps, sheet.ui);
    expect(sheet.deps.copyOriginal).not.toHaveBeenCalled();
    expect(sheet.deps.create).not.toHaveBeenCalled();
    expect(sheet.ui.fail).not.toHaveBeenCalled();
  });

  it("imports a small CSV as a table", async () => {
    const { deps, ui } = setup({ answers: [{ savePath: "data.md", again: false }] });
    await importFile("csv", deps, ui);
    const contents = written(deps).contents;
    expect(contents.endsWith("| a | b |\n| --- | --- |\n| 1 | 2 |\n\nOriginal: [data.csv](assets/originals/data.csv)\n")).toBe(true);
    expect(readProperties(contents)).toMatchObject({ ok: true, props: { source: "assets/originals/data.csv" } });
  });

  it("links a large CSV instead of a table", async () => {
    const rows = setup({ answers: [{ savePath: "data.md", again: false }] });
    rows.deps.readCsv = vi.fn(async () => "a,b\n" + "1,2\n".repeat(501));
    await importFile("csv", rows.deps, rows.ui);
    expect(written(rows.deps).contents.endsWith(
      "[data.csv](assets/originals/data.csv)\n\n501 rows, 2 columns. The file is too large for a table.\n")).toBe(true);
    const bytes = setup({ answers: [{ savePath: "data.md", again: false }] });
    bytes.deps.readCsv = vi.fn(async () => Promise.reject("too-large"));
    await importFile("csv", bytes.deps, bytes.ui);
    expect(written(bytes.deps).contents.endsWith(
      "[data.csv](assets/originals/data.csv)\n\nThe file is too large for a table.\n")).toBe(true);
  });

  it("writes link targets with spaces in angle brackets", async () => {
    const { deps, ui } = setup({ answers: [{ savePath: "data.md", again: false }] });
    deps.copyOriginal = vi.fn(async () => ({ link: "assets/originals/my data.csv" }));
    deps.probe = vi.fn(async () => ({ name: "my [data].csv", stem: "my [data]", bytes: 1, digest: "x" }));
    await importFile("csv", deps, ui);
    expect(written(deps).contents).toContain("Original: [my \\[data\\].csv](<assets/originals/my data.csv>)\n");
  });

  it("refuses to create the note when the folder changed during the import", async () => {
    const { deps, ui } = setup({ answers: [{ savePath: "report.md", again: false }] });
    const word = deps.word;
    deps.word = vi.fn(async (args) => { deps.folder = () => "/g"; return word(args); });
    await importFile("word", deps, ui);
    expect(ui.fail).toHaveBeenCalledWith("The folder changed. Nothing was imported into the new folder.");
    expect(deps.create).not.toHaveBeenCalled();
    expect(deps.created).not.toHaveBeenCalled();
  });

  it("says where the original went when the note cannot be created", async () => {
    const { deps, ui } = setup({ answers: [{ savePath: "report.md", again: false }] });
    deps.create = vi.fn(async () => Promise.reject("exists"));
    await importFile("word", deps, ui);
    expect(ui.fail).toHaveBeenCalledWith("Could not create the note. The original was copied to assets/originals/report.docx.");
    expect(deps.created).not.toHaveBeenCalled();
  });
});
