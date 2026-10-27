import { describe, expect, it } from "vitest";
import {
  changeDecision,
  draftIdFor,
  fileIdFor,
  hashText,
  isPdfDraft,
  isRecoverableDraft,
  shouldSnapshot,
  snapshotsToPrune,
  type DiskState,
  type DraftRecord,
  type SnapshotEntry,
} from "../recovery-policy";

const draft = (over: Partial<DraftRecord>): DraftRecord => ({
  id: "x",
  path: "/a.md",
  name: "a.md",
  contents: "hi",
  updatedAt: 1,
  windowId: "main",
  ...over,
});

describe("recovery-policy hashing and ids", () => {
  it("hashes text to a stable eight-character hex token", () => {
    expect(hashText("abc")).toBe(hashText("abc"));
    expect(hashText("abc")).not.toBe(hashText("abd"));
    expect(hashText("")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("creates filesystem-safe file and draft ids", () => {
    expect(fileIdFor("/Users/x/a.md")).toMatch(/^f[0-9a-f]{8}$/);
    expect(draftIdFor("/a.md", "t1")).toBe(fileIdFor("/a.md"));
    expect(draftIdFor(null, "t1")).toBe(`u${hashText("t1")}`);
  });
});

describe("isRecoverableDraft", () => {
  it("accepts non-empty contents", () => {
    expect(isRecoverableDraft(draft({ contents: "work" }))).toBe(true);
  });

  it("rejects empty or whitespace-only contents", () => {
    expect(isRecoverableDraft(draft({ contents: "   " }))).toBe(false);
  });

  it("rejects text drafts left for PDF documents", () => {
    expect(isRecoverableDraft(draft({ path: "/Docs/scan.PDF", name: "scan.PDF", contents: "t" }))).toBe(false);
    expect(isPdfDraft(draft({ path: null, name: "report.pdf" }))).toBe(true);
  });

  it("keeps drafts whose names only contain pdf", () => {
    expect(isRecoverableDraft(draft({ path: "/pdf-notes.md", name: "pdf-notes.md" }))).toBe(true);
    expect(isPdfDraft(draft({ path: "/a.pdf.md", name: "a.pdf.md" }))).toBe(false);
  });
});

describe("changeDecision", () => {
  const recorded: DiskState = { mtimeMs: 100, size: 5 };

  it("detects unchanged files", () => {
    expect(changeDecision(recorded, { mtimeMs: 100, size: 5 }, false)).toBe("unchanged");
    expect(changeDecision(recorded, { mtimeMs: 100, size: 5 }, true)).toBe("unchanged");
  });

  it("detects deleted, reloadable, and conflicting files", () => {
    expect(changeDecision(recorded, null, false)).toBe("deleted");
    expect(changeDecision(recorded, { mtimeMs: 200, size: 9 }, false)).toBe("reload");
    expect(changeDecision(recorded, { mtimeMs: 200, size: 9 }, true)).toBe("conflict");
  });

  it("does not infer a change without a recorded baseline", () => {
    expect(changeDecision(null, { mtimeMs: 200, size: 9 }, true)).toBe("unchanged");
  });
});

describe("snapshot policy", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = 1_000 * day;

  it("snapshots only changed content", () => {
    expect(shouldSnapshot(null, "aaaa")).toBe(true);
    expect(shouldSnapshot("aaaa", "aaaa")).toBe(false);
    expect(shouldSnapshot("aaaa", "bbbb")).toBe(true);
  });

  it("keeps small recent histories", () => {
    const entries: SnapshotEntry[] = [
      { ts: now, size: 1 },
      { ts: now - day, size: 1 },
    ];
    expect(snapshotsToPrune(entries, now)).toEqual([]);
  });

  it("keeps the newest ten even when old", () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({
      ts: now - i * 40 * day,
      size: 1,
    }));
    expect(snapshotsToPrune(entries, now)).toEqual([entries[10].ts, entries[11].ts]);
  });

  it("caps history at fifty entries", () => {
    const entries = Array.from({ length: 60 }, (_, i) => ({
      ts: now - i,
      size: 1,
    }));
    expect(snapshotsToPrune(entries, now)).toHaveLength(10);
  });
});
