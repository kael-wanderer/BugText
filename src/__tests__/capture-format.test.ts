import { describe, expect, it } from "vitest";
import {
  companionPath, companionStarter, excerptBlock, linkLabel, linkTarget, noteEntry, sourceRef, taskLine,
} from "../capture/format";

const doc = "# Arch\n\n## Sync model\n\ntext";

describe("sourceRef", () => {
  it("finds the heading at or above the line and the title", () => {
    expect(sourceRef("arch.md", doc, 5)).toEqual({ title: "Arch", heading: "Sync model", anchor: "sync-model" });
    expect(sourceRef("arch.md", doc, 3)).toEqual({ title: "Arch", heading: "Sync model", anchor: "sync-model" });
  });
  it("uses the file stem and no anchor above the first heading", () => {
    expect(sourceRef("docs/arch.md", "text\n## H", 1)).toEqual({ title: "arch", heading: null, anchor: null });
  });
  it("uses the title heading itself when the passage is under it", () => {
    expect(sourceRef("arch.md", "# Arch\n\ntext", 3)).toEqual({ title: "Arch", heading: "Arch", anchor: "arch" });
  });
  it("matches the anchor of a duplicate heading", () => {
    expect(sourceRef("a.md", "# T\n## A\nx\n## A\ny", 5).anchor).toBe("a-1");
  });
  it("ignores front matter", () => {
    expect(sourceRef("a.md", "---\nabout: x.md\n---\n\ntext", 5)).toEqual({ title: "a", heading: null, anchor: null });
  });
});

describe("labels and links", () => {
  it("labels with › and strips brackets and newlines", () => {
    expect(linkLabel({ title: "T", heading: "a]b\nc", anchor: "x" })).toBe("T › a b c");
    expect(linkLabel({ title: "T", heading: null, anchor: null })).toBe("T");
    expect(linkLabel({ title: "T", heading: "T", anchor: "t" })).toBe("T");
  });
  it("links relative to the note that receives the entry", () => {
    const ref = { title: "A", heading: "Sync model", anchor: "sync-model" };
    expect(linkTarget("notes/x.md", "docs/arch.md", ref)).toBe("../docs/arch.md#sync-model");
    expect(linkTarget("docs/arch.notes.md", "docs/arch.md", ref)).toBe("arch.md#sync-model");
    expect(linkTarget("x.md", "my docs/a b.md", { title: "A", heading: null, anchor: null })).toBe("<my docs/a b.md>");
  });
});

describe("entries", () => {
  it("writes the excerpt block of spec 3.2", () => {
    expect(excerptBlock(
      "The sync model assumes a single writer per folder.",
      "Architecture › Sync model", "architecture.md#sync-model", "2026-11-12",
      "I disagree: MCP clients write too. Check before building.",
    )).toBe(
      "> The sync model assumes a single writer per folder.\n" +
      "> — [Architecture › Sync model](architecture.md#sync-model) · 2026-11-12\n\n" +
      "I disagree: MCP clients write too. Check before building.\n",
    );
  });
  it("leaves out a blank comment and prefixes every quote line", () => {
    expect(excerptBlock("a\nb", "L", "t", "d", "  ")).toBe("> a\n> b\n> — [L](t) · d\n");
  });
  it("keeps HTML in quotes as text", () => {
    expect(excerptBlock("<img src=x onerror=alert(1)>", "L", "t", "d", "")).toBe("> <img src=x onerror=alert(1)>\n> — [L](t) · d\n");
  });
  it("writes a task line on one line", () => {
    expect(taskLine("a\nb ", "t")).toBe("- [ ] a b ([source](t))\n");
  });
  it("writes the Add note entry", () => {
    expect(noteEntry("Page", "page.html", "2026-11-14", "Looks fine.")).toBe("**2026-11-14** — [Page](page.html)\n\nLooks fine.\n");
    expect(noteEntry("Page", "page.html", "2026-11-14", " ")).toBe("**2026-11-14** — [Page](page.html)\n");
  });
});

describe("companion note", () => {
  it("puts the companion beside the source", () => {
    expect(companionPath("docs/arch.md")).toBe("docs/arch.notes.md");
    expect(companionPath("a.markdown")).toBe("a.notes.md");
    expect(companionPath("page.html")).toBe("page.notes.md");
    expect(companionPath("arch.notes.md")).toBeNull();
  });
  it("starts the companion with about: and a heading", () => {
    expect(companionStarter("docs/arch.md", "Architecture")).toBe("---\nabout: arch.md\n---\n\n# Notes on Architecture\n\n");
  });
});
