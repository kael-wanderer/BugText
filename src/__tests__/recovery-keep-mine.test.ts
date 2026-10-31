// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
const disk = vi.hoisted(() => ({ stat: { mtimeMs: 1, size: 10 } as { mtimeMs: number; size: number } | null }));
const invoke = vi.hoisted(() => vi.fn(async (command: string) => (command === "file_stat" ? disk.stat : "on disk")));
const confirm = vi.hoisted(() => vi.fn(async () => false));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ confirm }));
vi.mock("../compareview", () => ({ showComparison: vi.fn() }));
import { checkExternalChange, recordStat } from "../recovery";

const deps = () => ({ reload: vi.fn(), markDirty: vi.fn(), host: document.createElement("div") });
const path = "/notes/a.md";

beforeEach(async () => {
  confirm.mockClear(); disk.stat = { mtimeMs: 1, size: 10 };
  await recordStat(path);
});

it("does not ask again about the same disk version after Keep mine", async () => {
  disk.stat = { mtimeMs: 2, size: 12 };
  expect(await checkExternalChange(path, true, "mine", deps())).toBe("kept");
  expect(confirm).toHaveBeenCalledOnce();
  expect(await checkExternalChange(path, true, "mine", deps())).toBe("kept");
  expect(confirm).toHaveBeenCalledOnce();
});

it("asks again when the file changes on disk after Keep mine", async () => {
  disk.stat = { mtimeMs: 2, size: 12 };
  await checkExternalChange(path, true, "mine", deps());
  disk.stat = { mtimeMs: 3, size: 14 };
  await checkExternalChange(path, true, "mine", deps());
  expect(confirm).toHaveBeenCalledTimes(2);
});

it("still reports the file as changed for the save-time overwrite check", async () => {
  const { hasDiskChanged } = await import("../recovery");
  disk.stat = { mtimeMs: 2, size: 12 };
  await checkExternalChange(path, true, "mine", deps());
  expect(await hasDiskChanged(path)).toBe(true);
});
