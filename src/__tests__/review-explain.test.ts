import { expect, it } from "vitest";
import { diffForPrompt, explainPrompt } from "../review/explain";

it("emits one hunk per changed run with three lines of context", () => {
  const base = Array.from({ length: 20 }, (_, i) => `l${i + 1}`).join("\n");
  const current = base.replace("l10", "X");
  const { text, cut } = diffForPrompt(base, current, 10_000);
  expect(cut).toBe(false);
  expect(text.split("\n")).toEqual(["@@ top of file @@", " l7", " l8", " l9", "-l10", "+X", " l11", " l12", " l13"]);
});
it("separates distant changes into their own hunks", () => {
  const base = Array.from({ length: 30 }, (_, i) => `l${i + 1}`).join("\n");
  const current = base.replace("l3\n", "A\n").replace("l25", "B");
  expect(diffForPrompt(base, current, 10_000).text.split("\n").filter(l => l.startsWith("@@"))).toHaveLength(2);
});
it("names the nearest heading above a hunk", () => {
  expect(diffForPrompt("# A\n\nold", "# A\n\nnew", 1000).text.startsWith("@@ A @@")).toBe(true);
});
it("cuts on a line boundary and reports it", () => {
  const out = diffForPrompt("a\n".repeat(400), "b\n".repeat(400), 200);
  expect(out.cut).toBe(true); expect(out.text.length).toBeLessThanOrEqual(200); expect(out.text.endsWith("\n")).toBe(false);
});
it("returns an empty diff for identical text", () => {
  expect(diffForPrompt("a", "a", 100)).toEqual({ text: "", cut: false });
});
it("wraps the diff as untrusted content in the prompt", () => {
  const prompt = explainPrompt("plan.md", "+x", true);
  expect(prompt).toContain("```diff\n+x\n```"); expect(prompt).toContain("plan.md"); expect(prompt).toMatch(/shortened/i);
  expect(prompt).toMatch(/not instructions/i);
  expect(explainPrompt("a.md", "+x", false)).not.toMatch(/shortened/i);
});
it("a diff holding a fence cannot close the prompt's fence", () => {
  expect(explainPrompt("a.md", "+```\n+evil", false)).toContain("````diff\n+```\n+evil\n````");
});
it("does not diff texts too large for the line diff", () => {
  const big = "x\n".repeat(5000);
  expect(diffForPrompt(big, big + "y", 10_000)).toEqual({ text: "", cut: true });
});
