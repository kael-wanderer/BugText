import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ list: vi.fn(), read: vi.fn() }));
vi.mock("../filesys", () => ({ listDir: () => Promise.resolve([]), listFilesRecursive: mocks.list }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.read }));
import { createWorkspaceIndex } from "../ai/workspace-index";

describe("workspace index generations", () => {
  beforeEach(() => { mocks.list.mockReset(); mocks.read.mockReset(); });
  it("does not return the previous folder while it is building", async () => {
    let resolve!: (value: string[]) => void;
    mocks.list.mockImplementation((folder: string) => folder === "/a" ? new Promise<string[]>((r) => { resolve = r; }) : Promise.resolve(["b.md"]));
    mocks.read.mockResolvedValue("banana unique");
    const index = createWorkspaceIndex();
    const a = index.query("/a", "banana", 5);
    await Promise.resolve();
    const b = await index.query("/b", "banana", 5);
    resolve(["a.md"]);
    expect((await a)).toEqual([]);
    expect(b.every((chunk) => chunk.path.startsWith("/b/"))).toBe(true);
    expect(b.length).toBeGreaterThan(0);
  });
  it("retries a failed build and ignores outside changes", async () => {
    mocks.list.mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue(["a.md"]);
    mocks.read.mockResolvedValue("apple content");
    const index = createWorkspaceIndex();
    await expect(index.query("/a", "apple", 5)).rejects.toThrow();
    expect((await index.query("/a", "apple", 5)).length).toBeGreaterThan(0);
    index.onFileChanged("/other/b.md", "banana content");
    expect(await index.query("/a", "banana", 5)).toEqual([]);
  });
  it("applies changes made during a build", async () => {
    let resolve!: (text: string) => void;
    mocks.list.mockResolvedValue(["a.md"]);
    mocks.read.mockImplementation(() => new Promise<string>((r) => { resolve = r; }));
    const index = createWorkspaceIndex();
    const query = index.query("/a", "banana", 5);
    await Promise.resolve(); await Promise.resolve();
    index.onFileChanged("/a/a.md", "banana updated");
    resolve("old text");
    expect((await query).length).toBeGreaterThan(0);
  });
});

it("excludes files before reads and updates, and rebuilds after patterns change", async () => {
  mocks.list.mockResolvedValue(["private/a.md", "public.md"]);
  mocks.read.mockResolvedValue("banana content");
  let patterns = ["private/**"];
  const index = createWorkspaceIndex(() => patterns);
  expect((await index.query("/notes", "banana", 5)).map(c => c.path)).toEqual(["/notes/public.md"]);
  expect(mocks.read).not.toHaveBeenCalledWith("read_file", { path: "/notes/private/a.md" });
  index.onFileChanged("/notes/private/a.md", "banana secrets");
  expect((await index.query("/notes", "banana", 5)).every(c => !c.path.includes("private"))).toBe(true);
  patterns = ["**"];
  expect(await index.query("/notes", "banana", 5)).toEqual([]);
});
