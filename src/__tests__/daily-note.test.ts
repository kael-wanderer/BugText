import { describe, expect, it } from "vitest";
import { dailyNotePlan } from "../notes/daily";

describe("daily note plan", () => {
  const oct29 = new Date(2026, 9, 29, 9, 30);

  it("places today's note in Daily inside the open folder", () => {
    const plan = dailyNotePlan("/notes", oct29);
    expect(plan.path).toBe("/notes/Daily/2026-10-29.md");
    expect(plan.dir).toBe("Daily");
    expect(plan.stem).toBe("2026-10-29");
  });

  it("starts the note with a date property and a matching heading", () => {
    const plan = dailyNotePlan("/notes", oct29);
    expect(plan.contents).toBe("---\ndate: 2026-10-29\n---\n\n# 2026-10-29\n\n");
  });

  it("ignores trailing slashes on the folder", () => {
    expect(dailyNotePlan("/notes///", oct29).path).toBe("/notes/Daily/2026-10-29.md");
  });

  it("refuses to plan without an open folder", () => {
    expect(() => dailyNotePlan("", oct29)).toThrow("Open a folder to use the daily note.");
    expect(() => dailyNotePlan("/", oct29)).toThrow("Open a folder to use the daily note.");
  });
});
