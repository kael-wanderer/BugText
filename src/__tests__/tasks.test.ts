import { describe, expect, it } from "vitest";
import { taskAt, taskToggleChange, toggleTaskChanges, type TextChange } from "../tasks";

function apply(source: string, changes: TextChange[]): string {
  return [...changes].sort((a, b) => b.from - a.from).reduce(
    (text, change) => text.slice(0, change.from) + change.insert + text.slice(change.to),
    source,
  );
}

describe("taskAt", () => {
  it("finds bullet and ordered task markers", () => {
    expect(taskAt("- [ ] buy milk")).toEqual({ offset: 3, checked: false });
    expect(taskAt("  * [x] done")).toEqual({ offset: 5, checked: true });
    expect(taskAt("12) [X]")).toEqual({ offset: 5, checked: true });
  });

  it("ignores text that only looks like a task", () => {
    expect(taskAt("[ ] no list marker")).toBeNull();
    expect(taskAt("- [ ]no space")).toBeNull();
    expect(taskAt("- [y] other letter")).toBeNull();
    expect(taskAt("-[ ] no gap")).toBeNull();
  });
});

describe("taskToggleChange", () => {
  it("changes exactly one character", () => {
    expect(taskToggleChange("- [ ] a", 10)).toEqual({ from: 13, to: 14, insert: "x" });
    expect(taskToggleChange("- [x] a", 0)).toEqual({ from: 3, to: 4, insert: " " });
    expect(taskToggleChange("plain", 0)).toBeNull();
  });
});

describe("toggleTaskChanges", () => {
  it("flips tasks, adds boxes to list items and turns text into tasks", () => {
    const source = "- [x] done\n- item\n1. step\n  plain\n\n```\n- [ ] code\n```";
    expect(apply(source, toggleTaskChanges(source, [1, 2, 3, 4, 5, 7]))).toBe(
      "- [ ] done\n- [ ] item\n1. [ ] step\n  - [ ] plain\n\n```\n- [ ] code\n```",
    );
  });

  it("leaves lines with HTML comments and lines outside the range alone", () => {
    const source = "a <!-- c -->\nb";
    expect(toggleTaskChanges(source, [1])).toEqual([]);
    expect(apply(source, toggleTaskChanges(source, [2]))).toBe("a <!-- c -->\n- [ ] b");
  });
});
