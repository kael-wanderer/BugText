import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ builds: vi.fn(), files: vi.fn(async () => ["a.md"]), read: vi.fn(async () => "original text") }));
vi.mock("../filesys", () => ({ listDir: async () => [], listFilesRecursive: mocks.files }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.read }));
vi.mock("../ai/retrieval", async importOriginal => {
  const original = await importOriginal<typeof import("../ai/retrieval")>();
  return { ...original, buildIndex: (...args: Parameters<typeof original.buildIndex>) => { mocks.builds(); return original.buildIndex(...args); } };
});
import { createWorkspaceIndex } from "../ai/workspace-index";
it("rebuilds once at query after multiple changes and clears staleness on reset", async () => {
  const index = createWorkspaceIndex(() => ["private/**"]);
  await index.query("/notes", "original", 5); mocks.builds.mockClear();
  for (let i = 0; i < 10; i++) index.onFileChanged("/notes/a.md", `updated banana ${i}`);
  index.onFileChanged("/notes/private/no.md", "banana secret");
  expect(mocks.builds).not.toHaveBeenCalled();
  expect((await index.query("/notes", "banana", 5)).map(chunk => chunk.path)).toEqual(["/notes/a.md"]);
  expect(mocks.builds).toHaveBeenCalledTimes(1); expect(index.chunkCount).toBeGreaterThan(0);
  await index.queryScored("/notes", "banana", 5); expect(mocks.builds).toHaveBeenCalledTimes(1);
  index.onFileChanged("/notes/a.md", "new data"); index.reset();
  expect(index.chunkCount).toBe(0);
  await index.query("/notes", "original", 5); expect(mocks.builds).toHaveBeenCalledTimes(3);
});
