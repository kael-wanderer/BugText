import { beforeEach, expect, it, vi } from "vitest";

const writes: Array<string | null> = [];
let release: (() => void) | null = null;
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: { contents?: string | null }) => {
    if (command === "pdf_draft_read") return writes[writes.length - 1] ?? null;
    // Hold the first write open so later ones queue behind it.
    if (!release && writes.length === 0) await new Promise<void>((resolve) => (release = resolve));
    writes.push(args.contents ?? null);
    return null;
  }),
}));

import { readPdfDraft, writePdfDraft } from "../pdf-draft-store";

beforeEach(() => {
  writes.length = 0;
  release = null;
});

it("writes drafts in order and skips superseded ones", async () => {
  const first = writePdfDraft("/a.pdf", "one");
  const second = writePdfDraft("/a.pdf", "two");
  const third = writePdfDraft("/a.pdf", null);
  // A read while writes wait sees the newest state.
  expect(await readPdfDraft("/a.pdf")).toBeNull();
  release?.();
  expect(await Promise.all([first, second, third])).toEqual([true, true, true]);
  expect(writes).toEqual(["one", null]);
});
