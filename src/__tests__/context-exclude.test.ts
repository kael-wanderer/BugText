import { expect, it } from "vitest";
import { isContextExcluded, matchesContextGlob } from "../ai/context-exclude";
import { parseAISettings } from "../ai/aisettings";
it("matches glob stars, question marks and folder-relative paths", () => {
  for (const [path, pattern, result] of [["private/a.md", "private/**", true], ["a/b/private/a.md", "private/**", false], ["a.secret.md", "*.secret.md", true], ["notes/a.secret.md", "*.secret.md", true], ["a/b.md", "*.md", true], ["a/b/c.md", "a/*.md", false], ["a/b/c.md", "a/**/*.md", true], ["a/c.md", "a/**/*.md", true], ["file1.md", "file?.md", true], ["file12.md", "file?.md", false], ["a[1].md", "a[1].md", true]] as const) expect(matchesContextGlob(path, pattern)).toBe(result);
  expect(isContextExcluded("/notes/private/../private/a.md", "/notes", ["private/**"])).toBe(true);
  expect(isContextExcluded("C:\\notes\\private\\a.md", "C:\\notes", ["private/**"])).toBe(true);
});
it("parses exclusions per field without losing unrelated AI settings", () => {
  const parsed = parseAISettings(JSON.stringify({ version: 2, maxContextChars: 60000, context: { exclude: ["private/**", 3, "*.secret.md"] } }));
  expect(parsed.context.exclude).toEqual(["private/**", "*.secret.md"]); expect(parsed.maxContextChars).toBe(60000);
  expect(parseAISettings('{"version":2,"context":{"exclude":false},"maxContextChars":60000}').maxContextChars).toBe(60000);
});
