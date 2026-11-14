import { it, expect } from "vitest";
import { fenceBody, fixMermaidAction, stripCodeFence } from "../ai/fix-mermaid";
const DOC = "# T\n\n```mermaid\ngraph TD\n  A-->B\n```\n\nafter\n";

it("finds the body between the fences", () => {
  const range = fenceBody(DOC, 3)!;
  expect(range.body).toBe("graph TD\n  A-->B\n");
  expect(DOC.slice(range.from, range.to)).toBe(range.body);
});
it("handles tildes, longer fences and CRLF", () => {
  expect(fenceBody("~~~~mermaid\na\n~~~\nb\n~~~~\n", 1)!.body).toBe("a\n~~~\nb\n");
  expect(fenceBody("```mermaid\r\na\r\n```\r\n", 1)!.body).toBe("a\r\n");
});
it("returns null for a line that opens nothing or never closes", () => {
  expect(fenceBody(DOC, 1)).toBeNull();
  expect(fenceBody(DOC, 99)).toBeNull();
  expect(fenceBody("```mermaid\ngraph TD\n", 1)).toBeNull();
});
it("builds an edit action that carries the error as quoted data", () => {
  const action = fixMermaidAction("Parse error on line 2:\n" + "x".repeat(2000));
  expect(action).toMatchObject({ id: "ai.fix.mermaid", name: "Fix diagram", result: "edit", input: "selection-or-note", engine: null, feature: "rewrite", panel: false });
  expect(action.instruction).toContain("Parse error on line 2:");
  expect(action.instruction.length).toBeLessThan(1200);
});
it("strips one wrapping fence from a reply", () => {
  expect(stripCodeFence("```mermaid\ngraph TD\n  A-->B\n```")).toBe("graph TD\n  A-->B");
  expect(stripCodeFence("graph TD\n  A-->B")).toBe("graph TD\n  A-->B");
  expect(stripCodeFence("Here:\n```\nx\n```")).toBe("Here:\n```\nx\n```");
});
