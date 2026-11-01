import { describe, expect, it } from "vitest";
import { bodyWords, parseGoalInput, readNoteGoal } from "../writing-goals/note-goal";
describe("note goals", () => {
  it("reads only valid top-level numeric goals", () => {
    expect(readNoteGoal("---\nword_goal: 1500\n---\nx")).toEqual({kind:"set",goal:1500});
    for (const source of ["x", "---\ntitle: a\n---\n", "word_goal: 5", "---\na:\n  word_goal: 5\n---\n"]) expect(readNoteGoal(source)).toEqual({kind:"none"});
    for (const value of ["lots", '"1500"', "12.5", "-3", "0", "1000001"]) expect(readNoteGoal(`---\nword_goal: ${value}\n---\n`)).toEqual({kind:"invalid"});
  });
  it("counts body and validates input", () => {
    expect(bodyWords("---\nword_goal: 3\ntitle: a b c\n---\none two")).toBe(2);
    expect(bodyWords("one two")).toBe(2);
    expect(parseGoalInput("")).toBeNull(); expect(parseGoalInput(" 500 ")).toBe(500);
    for (const value of ["12.5", "abc", "0", "1000001"]) expect(parseGoalInput(value)).toBe("invalid");
  });
});
