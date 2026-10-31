import { expect, it, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => new Uint8Array([0, 1, 255]).buffer) }));
import { invoke } from "@tauri-apps/api/core";
import { readFileBytes } from "../file-bytes";
it("reads the binary response as bytes", async () => {
  expect(await readFileBytes("/note.pdf")).toEqual(new Uint8Array([0, 1, 255]));
  expect(invoke).toHaveBeenCalledWith("read_file_bytes", { path: "/note.pdf" });
});
it("uses no numeric-array IPC for file bytes", () => {
  const files = import.meta.glob<string>("../**/*.ts", { eager: true, query: "?raw", import: "default" });
  for (const [file, source] of Object.entries(files)) if (!file.endsWith(".test.ts")) expect(source, file).not.toMatch(/invoke\s*<\s*number\[\]\s*>\s*\(\s*["']read_file_bytes/);
});
