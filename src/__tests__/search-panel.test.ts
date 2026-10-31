import { loadProperties } from "../properties/loader";
await loadProperties();
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), pdf: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("../pdf-search", () => ({ searchPdf: mocks.pdf }));
import { createSearchPanel } from "../search";

const result = (relative: string) => ({ hits: [{ path: "/a/" + relative, relative, line: 1, snippet: "hello", match_start: 0, match_end: 5 }], files_searched: 1, skipped: [], walk_limit: false, hit_limit: false, cancelled: false });
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
describe("search panel", () => {
  beforeEach(() => { mocks.invoke.mockReset(); mocks.pdf.mockReset(); });
  it("renders text safely before a PDF finishes and retains it on Stop", async () => {
    mocks.invoke.mockImplementation((command: string) => command === "search_in_folder" ? Promise.resolve(result("<img src=x onerror=alert(1)>.md")) : Promise.resolve());
    mocks.pdf.mockImplementation(() => new Promise(() => {}));
    const host = document.createElement("div");
    createSearchPanel(host, { getFolder: () => "/a", getFiles: () => ["a.pdf", "b.pdf"], onOpenHit: () => {} });
    const input = host.querySelector("input")!; input.value = "hello"; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await flush();
    expect(host.textContent).toContain("<img src=x onerror=alert(1)>.md");
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("Searching PDFs · 1 of 2");
    [...host.querySelectorAll("button")].find((b) => b.textContent === "Stop")!.click();
    expect(host.textContent).toContain("Stopped · 1 result in 1 file · 2 PDFs not searched");
  });
  it("discards an older pending result", async () => {
    let resolve!: (value: ReturnType<typeof result>) => void;
    mocks.invoke.mockImplementation((command: string, args: { query?: string }) => command !== "search_in_folder" ? Promise.resolve() : args.query === "old" ? new Promise((r) => { resolve = r; }) : Promise.resolve(result("new.md")));
    const host = document.createElement("div"); createSearchPanel(host, { getFolder: () => "/a", getFiles: () => [], onOpenHit: () => {} });
    const input = host.querySelector("input")!; input.value = "old"; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); await flush();
    input.value = "new"; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); await flush(); resolve(result("old.md")); await flush();
    expect(host.textContent).toContain("new.md"); expect(host.textContent).not.toContain("old.md");
  });
  it("shows invalid patterns and skipped-file overflow", async () => {
    mocks.invoke.mockImplementation((command: string) => command !== "search_in_folder" ? Promise.resolve() : Promise.resolve({ ...result("a.md"), skipped: Array.from({ length: 52 }, (_, i) => ({ relative: `file${i}`, reason: "not_text" })) }));
    const host = document.createElement("div"); createSearchPanel(host, { getFolder: () => "/a", getFiles: () => [], onOpenHit: () => {} });
    const input = host.querySelector("input")!; input.value = "hello"; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); await flush();
    expect(host.textContent).toContain("52 files skipped"); expect(host.textContent).toContain("and 2 more");
    mocks.invoke.mockImplementation((command: string) => command === "search_in_folder" ? Promise.reject("unclosed group") : Promise.resolve());
    host.querySelector<HTMLButtonElement>('[data-option="regex"]')!.click(); await flush();
    expect(host.textContent).toContain("Invalid regular expression"); expect(input.getAttribute("aria-invalid")).toBe("true");
  });
});
describe("replace in search", () => {
  beforeEach(() => { mocks.invoke.mockReset(); mocks.pdf.mockReset(); });
  it("opens replace, shows literal previews and filters results without PDF search", async () => {
    mocks.invoke.mockImplementation((command: string) => command === "search_in_folder" ? Promise.resolve(result("docs/a.md")) : Promise.resolve());
    const host = document.createElement("div"); createSearchPanel(host, { getFolder: () => "/a", getFiles: () => ["a.pdf", "docs/a.md"], onOpenHit: () => {} });
    const query = host.querySelector<HTMLInputElement>(".search-input")!, replacement = host.querySelector<HTMLInputElement>(".search-replacement")!;
    expect(host.querySelector<HTMLButtonElement>(".search-preview-replace")!.disabled).toBe(true);
    query.value = "hello"; replacement.value = "world"; host.querySelector<HTMLButtonElement>(".search-replace-toggle")!.click(); await flush();
    expect(host.querySelector<HTMLElement>(".search-replace-fields")!.hidden).toBe(false); expect(host.querySelector("del")?.textContent).toBe("hello"); expect(host.querySelector("ins")?.textContent).toBe("world"); expect(mocks.pdf).not.toHaveBeenCalled(); expect(host.textContent).toContain("Replace searches text files only.");
    const exclude = host.querySelector<HTMLInputElement>(".search-exclude")!; exclude.value = "*.md"; query.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); await flush(); expect(host.querySelector(".search-hit")).toBeNull();
  });
  it("expands regex groups and disables preview for invalid groups", async () => {
    mocks.invoke.mockImplementation((command: string, args: { replacement?: string }) => command === "replace_check_groups" && args.replacement === "$4" ? Promise.reject("Group 4 is not in the pattern.") : command === "search_in_folder" ? Promise.resolve(result("a.md")) : Promise.resolve());
    const host = document.createElement("div"); createSearchPanel(host, { getFolder: () => "/a", getFiles: () => [], onOpenHit: () => {} });
    const query = host.querySelector<HTMLInputElement>(".search-input")!, replacement = host.querySelector<HTMLInputElement>(".search-replacement")!;
    query.value = "(hello)"; replacement.value = "$1!"; host.querySelector<HTMLButtonElement>(".search-replace-toggle")!.click(); await flush(); host.querySelector<HTMLButtonElement>('[data-option="regex"]')!.click(); await flush(); await flush(); expect(host.querySelector("ins")?.textContent).toBe("hello!");
    query.value = "(?P<word>hello)"; replacement.value = "${word}!"; query.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); await flush(); await flush(); expect(host.querySelector("ins")?.textContent).toBe("hello!");
    replacement.value = "$4"; query.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); await flush(); expect(host.textContent).toContain("Group 4 is not in the pattern."); expect(host.querySelector<HTMLButtonElement>(".search-preview-replace")!.disabled).toBe(true);
  });
});

it("preselects files for operator-only and combined searches", async () => {
  const { createLinkIndex, parseNote } = await import("../links/index");
  const notes = [parseNote("/a/a.md", "#work\naction here"), parseNote("/a/b.md", "#other\naction there")];
  const index = createLinkIndex(async () => ({ notes, skipped: [] }));
  mocks.invoke.mockResolvedValue(undefined);
  const host = document.createElement("div"); createSearchPanel(host, { getFolder: () => "/a", getFiles: () => ["a.md", "b.md"], index, onOpenHit: () => {} });
  const input = host.querySelector<HTMLInputElement>(".search-input")!;
  input.value = "tag:work action"; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); await flush(); await flush();
  expect(host.textContent).toContain("a.md"); expect(host.textContent).not.toContain("b.md");
  input.value = "tag:work"; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); await flush(); await flush();
  expect(host.textContent).toContain("a.md"); expect(host.textContent).not.toContain("b.md");
});

it("shows finished empty results and clears active file filters", async () => {
  mocks.invoke.mockReset();
  mocks.invoke.mockImplementation((command: string) => command === "search_in_folder" ? Promise.resolve({ ...result("a.md"), hits: [] }) : Promise.resolve());
  const host = document.createElement("div"); createSearchPanel(host, { getFolder: () => "/a", getFiles: () => [], onOpenHit: () => {} });
  const input = host.querySelector<HTMLInputElement>(".search-input")!; input.value = '<img src=x onerror=alert(1)>'; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); await flush(); await flush();
  expect(host.textContent).toContain(`No matches for "${input.value}".`); expect(host.querySelector("img")).toBeNull();
  host.querySelector<HTMLButtonElement>(".search-replace-toggle")!.click(); await flush(); await flush();
  const include = host.querySelector<HTMLInputElement>(".search-include")!, exclude = host.querySelector<HTMLInputElement>(".search-exclude")!;
  include.value = "*.md"; exclude.value = "private/**"; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); await flush(); await flush();
  expect(host.textContent).toContain("narrowing this search"); const before = mocks.invoke.mock.calls.filter(([name]) => name === "search_in_folder").length;
  [...host.querySelectorAll("button")].find(button => button.textContent === "Clear file filters")!.click(); await flush(); await flush();
  expect(include.value).toBe(""); expect(exclude.value).toBe(""); expect(mocks.invoke.mock.calls.filter(([name]) => name === "search_in_folder").length).toBeGreaterThan(before);
});
it("does not show empty results while a search is running", async () => {
  mocks.invoke.mockImplementation(command => command === "search_in_folder" ? new Promise(() => {}) : Promise.resolve());
  const host = document.createElement("div"); createSearchPanel(host, { getFolder: () => "/a", getFiles: () => [], onOpenHit: () => {} });
  const input = host.querySelector("input")!; input.value = "missing"; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); await flush();
  expect(host.textContent).not.toContain("No matches for");
});
it("counts only the results the file filters keep", async () => {
  mocks.invoke.mockReset();
  mocks.invoke.mockImplementation((command: string) => command === "search_in_folder" ? Promise.resolve(result("a.md")) : Promise.resolve());
  const host = document.createElement("div"); createSearchPanel(host, { getFolder: () => "/a", getFiles: () => [], onOpenHit: () => {} });
  host.querySelector<HTMLButtonElement>(".search-replace-toggle")!.click(); await flush(); await flush();
  const input = host.querySelector<HTMLInputElement>(".search-input")!; input.value = "hello";
  host.querySelector<HTMLInputElement>(".search-include")!.value = "*.txt";
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); await flush(); await flush();
  expect(host.textContent).toContain("narrowing this search");
  expect(host.textContent).not.toContain("1 result in 1 file");
  expect(host.textContent).not.toContain("No results"); // the empty state says it once
});
