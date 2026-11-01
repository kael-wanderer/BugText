import { findFrontMatter } from "../properties/frontmatter";
import { countWords } from "../status-bar/model";

export type NoteGoal = { kind: "none" } | { kind: "set"; goal: number } | { kind: "invalid" };

export function parseGoalInput(text: string): number | null | "invalid" {
  const value = text.trim();
  if (!value) return null;
  if (!/^\d+$/.test(value)) return "invalid";
  const goal = Number(value);
  return Number.isSafeInteger(goal) && goal >= 1 && goal <= 1_000_000 ? goal : "invalid";
}

export function readNoteGoal(source: string): NoteGoal {
  const frontmatter = findFrontMatter(source);
  if (!frontmatter) return { kind: "none" };
  const match = /^word_goal:[ \t]*(.*?)[ \t]*\r?$/m.exec(frontmatter.block);
  if (!match) return { kind: "none" };
  const goal = parseGoalInput(match[1]);
  return typeof goal === "number" ? { kind: "set", goal } : { kind: "invalid" };
}

export function bodyWords(source: string): number {
  return countWords(source.slice(findFrontMatter(source)?.end ?? 0));
}
