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
it("extracts the first fenced block even with surrounding prose", () => {
  expect(stripCodeFence("```mermaid\ngraph TD\n  A-->B\n```")).toBe("graph TD\n  A-->B");
  expect(stripCodeFence("graph TD\n  A-->B")).toBe("graph TD\n  A-->B");
  expect(stripCodeFence("Here:\n```mermaid\ngraph TD\n```\nDone.")).toBe("graph TD");
});
it("trims an unfenced reply", () => {
  expect(stripCodeFence(" \n graph TD\n  A-->B \n")).toBe("graph TD\n  A-->B");
});
it("extracts only the first fenced block", () => {
  expect(stripCodeFence("Before\n~~~mermaid\ngraph TD\n~~~\n```\nsecond\n```")).toBe("graph TD");
});
it("removes every triple quote from parser errors before quoting them", () => {
  const action = fixMermaidAction('Bad """token""" and """""" end');
  expect(action.instruction.match(/"""/g)).toHaveLength(2);
  expect(action.instruction).toContain('Bad token and  end');
});
