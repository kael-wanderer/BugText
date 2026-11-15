import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateGuide, type GuideProblem } from "../guide/guideValidator";

// Vitest runs from the repository root, as the other file-reading tests assume.
const FIXTURES = "src/__tests__/fixtures/guide";

/** Each fixture is a small guide with one thing wrong, named for that thing. */
function problems(name: string, appSlugs: string[] = []): GuideProblem[] {
  return validateGuide(join(FIXTURES, name), appSlugs);
}

describe("validateGuide", () => {
  it("passes a guide with links, anchors, an image, key caps, a callout and a redirect", () => {
    expect(problems("valid", ["a/one", "a/old", "b/two"])).toEqual([]);
  });

  it("reports a listed page with no file", () => {
    expect(problems("missing-file")).toEqual([{ kind: "missingFile", slug: "a/one" }]);
  });

  it("reports a page that guide.json does not list", () => {
    expect(problems("orphan")).toEqual([{ kind: "orphan", slug: "a/stray" }]);
  });

  it("reports a link to a page that does not exist", () => {
    expect(problems("broken-link")).toEqual([{ kind: "brokenLink", page: "a/one", target: "missing.md" }]);
  });

  it("reports an image that does not exist", () => {
    expect(problems("missing-image")).toEqual([
      { kind: "missingImage", page: "a/one", path: "../images/a/one/shot.png" },
    ]);
  });

  it("reports a script tag", () => {
    expect(problems("script-tag")).toEqual([{ kind: "forbiddenHTML", page: "a/one", snippet: "<script" }]);
  });

  it("reports a javascript: link", () => {
    expect(problems("javascript-link")).toEqual([{ kind: "forbiddenHTML", page: "a/one", snippet: "javascript:" }]);
  });

  it("reports frontmatter that disagrees with guide.json", () => {
    expect(problems("frontmatter-mismatch")).toEqual([{ kind: "frontmatterMismatch", slug: "a/one" }]);
  });

  it("reports a slug that is not one lowercase folder and one name", () => {
    expect(problems("bad-slug")).toEqual([{ kind: "badSlug", slug: "Cleanup/Page" }]);
  });

  it("reports a slug the app links to that the guide no longer has", () => {
    expect(problems("dead-app-link", ["a/one", "a/removed"])).toEqual([{ kind: "deadAppLink", slug: "a/removed" }]);
  });

  it("reports a published slug the guide no longer has", () => {
    expect(problems("dead-published-slug")).toEqual([{ kind: "deadPublishedSlug", slug: "a/gone" }]);
  });

  it("keeps a published slug alive through a redirect", () => {
    expect(problems("redirect-keeps-slug")).toEqual([]);
  });

  it("refuses a guide.json version it does not know", () => {
    expect(problems("unknown-version")).toEqual([{ kind: "unsupportedVersion", version: 2 }]);
  });

  it("reports a slug listed twice, once", () => {
    expect(problems("duplicate-slug")).toEqual([{ kind: "duplicateSlug", slug: "a/one" }]);
  });

  it("allows key caps", () => {
    expect(problems("kbd-allowed")).toEqual([]);
  });

  it("does not read a less-than sign in prose as a tag", () => {
    expect(problems("prose-less-than")).toEqual([]);
  });

  it("throws when there is no guide.json at all", () => {
    expect(() => problems("does-not-exist")).toThrow();
  });
});
