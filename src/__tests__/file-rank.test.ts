import { describe, expect, it } from "vitest";
import { cleanFileQuery, rankFiles } from "../file-rank";

const paths = [
  "docs/superpowers/prompts/2026-11-20-codex-review.md",
  "docs/superpowers/prompts/2026-11-26-codex-skit.md",
  "docs/plans/codex-skit-notes.md",
  "README.md",
  "src/readme-helper.ts",
];

describe("cleanFileQuery", () => {
  it("strips ./, the open folder and a :line suffix", () => {
    expect(cleanFileQuery("./docs/a.md", "/x/proj")).toEqual({ query: "docs/a.md", line: null });
    expect(cleanFileQuery("/x/proj/docs/a.md:42", "/x/proj")).toEqual({ query: "docs/a.md", line: 42 });
    expect(cleanFileQuery("docs/a.md:42:7", null)).toEqual({ query: "docs/a.md", line: 42 });
    expect(cleanFileQuery("  'docs/a.md'  ", null)).toEqual({ query: "docs/a.md", line: null });
  });
  it("keeps a path outside the folder as typed", () => {
    expect(cleanFileQuery("/other/a.md", "/x/proj").query).toBe("other/a.md");
  });
});

describe("rankFiles", () => {
  it("puts the exact path first and marks it", () => {
    const ranked = rankFiles("docs/superpowers/prompts/2026-11-26-codex-skit.md", paths);
    expect(ranked[0]).toMatchObject({ path: "docs/superpowers/prompts/2026-11-26-codex-skit.md", exact: true });
  });
  it("ranks an exact file name above longer names", () => {
    expect(rankFiles("readme.md", paths)[0].path).toBe("README.md");
  });
  it("ranks a name prefix above a fuzzy match", () => {
    const ranked = rankFiles("readme", paths).map(f => f.path);
    expect(ranked.slice(0, 2)).toEqual(["README.md", "src/readme-helper.ts"]);
  });
  it("ignores spaces in a fuzzy query", () => {
    const ranked = rankFiles("codex skit", paths).map(f => f.path);
    expect(ranked).toContain("docs/superpowers/prompts/2026-11-26-codex-skit.md");
    expect(ranked).not.toContain("docs/superpowers/prompts/2026-11-20-codex-review.md");
  });
  it("highlights only characters inside the file name", () => {
    const [file] = rankFiles("plans/codex", ["docs/plans/codex-skit-notes.md"]);
    expect(file.hits.every(i => i >= 0 && i < "codex-skit-notes.md".length)).toBe(true);
    expect(file.hits.length).toBeGreaterThan(0);
  });
  it("returns every path unranked for an empty query", () => {
    expect(rankFiles("", paths)).toHaveLength(paths.length);
  });
});

describe("lineMatchRange", async () => {
  const { lineMatchRange } = await import("../line-match");
  it("finds the match on the given line", () => {
    expect(lineMatchRange("one\ntwo hello\nthree", 2, "hello")).toEqual({ from: 8, to: 13 });
  });
  it("is null when the line no longer has it", () => {
    expect(lineMatchRange("one\ntwo", 2, "hello")).toBeNull();
    expect(lineMatchRange("one", 5, "one")).toBeNull();
  });
});
