import { afterEach, expect, it, vi } from "vitest";
import { libraryFor } from "../citations/library";
afterEach(() => vi.useRealTimers());
it("finds a property bibliography and rejects unsafe paths", async () => {
  const deps = { stat: vi.fn(async () => ({ mtimeMs: 1, size: 4 })), read: vi.fn(async () => '[{"id":"key","title":"Title"}]') };
  const result = await libraryFor("/lib4/note.md", "---\nbibliography: [refs.json, other.bib]\n---\n", "/lib4", deps);
  expect(result.status).toBe("ok"); expect(deps.read).toHaveBeenCalledWith("/lib4/refs.json", "/lib4");
  expect((await libraryFor("/lib4/note.md", "---\nbibliography: ../../secret.bib\n---\n", "/lib4", deps)).status).toBe("error");
  expect((await libraryFor("/lib4/note.md", "---\nbibliography: /secret.bib\n---\n", "/lib4", deps)).status).toBe("error");
});
it("uses root fallback, caches and reloads after changes", async () => {
  vi.useFakeTimers(); let mtime = 1;
  const deps = { stat: vi.fn(async (path: string) => path.endsWith(".bib") ? null : { mtimeMs: mtime, size: 3 }), read: vi.fn(async () => '[{"id":"x"}]') };
  expect((await libraryFor("/lib5/n.md", "", "/lib5", deps)).status).toBe("ok");
  await libraryFor("/lib5/n.md", "", "/lib5", deps); expect(deps.read).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(3001); mtime++; await libraryFor("/lib5/n.md", "", "/lib5", deps); expect(deps.read).toHaveBeenCalledTimes(2);
});
it("returns none or a generic error without throwing", async () => {
  const none = { stat: async () => null, read: async () => "" };
  expect((await libraryFor("/lib6/n.md", "", "/lib6", none)).status).toBe("none");
  expect((await libraryFor(null, "", "/lib6", none)).status).toBe("none");
  const big = { stat: async () => ({ mtimeMs: 1, size: 6 * 1024 * 1024 }), read: async () => "" };
  expect((await libraryFor("/lib6/n.md", "", "/lib6", big)).status).toBe("error");
  const broken = { stat: async () => ({ mtimeMs: 1, size: 1 }), read: async () => { throw new Error("secret"); } };
  expect(await libraryFor("/lib7/n.md", "", "/lib7", broken)).toEqual({ status: "error" });
});
