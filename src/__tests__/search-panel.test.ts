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
    query.value = "hello"; replacement.value = "world"; host.querySelector<HTMLButtonElement>(".search-replace-toggle")!.click(); await flush();
    expect(host.querySelector<HTMLElement>(".search-replace-fields")!.hidden).toBe(false); expect(host.querySelector("del")?.textContent).toBe("hello"); expect(host.querySelector("ins")?.textContent).toBe("world"); expect(mocks.pdf).not.toHaveBeenCalled(); expect(host.textContent).toContain("Replace searches text files only.");
    const exclude = host.querySelector<HTMLInputElement>(".search-exclude")!; exclude.value = "*.md"; query.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); await flush(); expect(host.querySelector(".search-hit")).toBeNull();
  });
  it("expands regex groups and disables preview for invalid groups", async () => {
    mocks.invoke.mockImplementation((command: string, args: { replacement?: string }) => command === "replace_check_groups" && args.replacement === "$4" ? Promise.reject("Group 4 is not in the pattern.") : command === "search_in_folder" ? Promise.resolve(result("a.md")) : Promise.resolve());
    const host = document.createElement("div"); createSearchPanel(host, { getFolder: () => "/a", getFiles: () => [], onOpenHit: () => {} });
    const query = host.querySelector<HTMLInputElement>(".search-input")!, replacement = host.querySelector<HTMLInputElement>(".search-replacement")!;
    query.value = "(hello)"; replacement.value = "$1!"; host.querySelector<HTMLButtonElement>(".search-replace-toggle")!.click(); await flush(); host.querySelector<HTMLButtonElement>('[data-option="regex"]')!.click(); await flush(); await flush(); expect(host.querySelector("ins")?.textContent).toBe("hello!");
    replacement.value = "$4"; query.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); await flush(); expect(host.textContent).toContain("Group 4 is not in the pattern."); expect(host.querySelector<HTMLButtonElement>(".search-preview-replace")!.disabled).toBe(true);
  });
});
