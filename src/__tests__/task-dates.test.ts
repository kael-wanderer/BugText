import { describe, expect, it } from "vitest";
import { dueGroup, DUE_LABELS, taskDue } from "../task-inbox/dates";
import { taskToggleEdits, toggleTaskChanges, type TextChange } from "../tasks";
import { inboxTaskChange, noteTasks } from "../task-inbox/model";
import { parseNote } from "../links/index";
import { parseSettings } from "../settings";

const apply = (source: string, changes: TextChange[]): string =>
  [...changes].sort((a, b) => b.from - a.from).reduce((text, c) => text.slice(0, c.from) + c.insert + text.slice(c.to), source);

describe("taskDue", () => {
  it("reads due: or the calendar emoji, first valid date", () => {
    expect(taskDue("Send list due:2026-11-10")).toBe("2026-11-10");
    expect(taskDue("x 📅 2026-11-15")).toBe("2026-11-15");
    expect(taskDue("due:2026-13-40 📅 2026-11-02")).toBe("2026-11-02");
    expect(taskDue("overdue:2026-11-10")).toBeNull();
    expect(taskDue("no date")).toBeNull();
  });
});

describe("dueGroup", () => {
  it("groups around today", () => {
    const today = "2026-11-12";
    expect(dueGroup("2026-11-10", today)).toBe("overdue");
    expect(dueGroup("2026-11-12", today)).toBe("today");
    expect(dueGroup("2026-11-13", today)).toBe("week");
    expect(dueGroup("2026-11-19", today)).toBe("week");
    expect(dueGroup("2026-11-20", today)).toBe("later");
    expect(dueGroup(null, today)).toBe("none");
    expect(dueGroup("2026-12-31", "2026-12-28")).toBe("week");
    expect(DUE_LABELS).toEqual({ overdue: "Overdue", today: "Today", week: "This week", later: "Later", none: "No date" });
  });
});

describe("completion stamp", () => {
  it("adds the date when checking, before trailing spaces", () => {
    expect(apply("- [ ] Do it  ", taskToggleEdits("- [ ] Do it  ", 0, "2026-11-12"))).toBe("- [x] Do it ✅ 2026-11-12  ");
  });
  it("removes a trailing stamp when unchecking", () => {
    expect(apply("- [x] Do it ✅ 2026-11-01", taskToggleEdits("- [x] Do it ✅ 2026-11-01", 0, "2026-11-12"))).toBe("- [ ] Do it");
  });
  it("never adds a second stamp, and only flips the marker without a stamp", () => {
    expect(apply("- [ ] Do it ✅ 2026-11-01", taskToggleEdits("- [ ] Do it ✅ 2026-11-01", 0, "2026-11-12"))).toBe("- [x] Do it ✅ 2026-11-01");
    expect(apply("- [ ] Do it", taskToggleEdits("- [ ] Do it", 0, null))).toBe("- [x] Do it");
    expect(apply("- [x] Do it ✅ 2026-11-01", taskToggleEdits("- [x] Do it ✅ 2026-11-01", 0, null))).toBe("- [ ] Do it ✅ 2026-11-01");
    expect(taskToggleEdits("plain", 0, "2026-11-12")).toEqual([]);
  });
  it("Toggle Task stamps tasks only, not lines that become tasks", () => {
    const source = "intro\n- [ ] a\n- item";
    expect(apply(source, toggleTaskChanges(source, [1, 2, 3], "2026-11-12"))).toBe("- [ ] intro\n- [x] a ✅ 2026-11-12\n- [ ] item");
  });
  it("the task inbox change carries the stamp", () => {
    const source = "- [ ] a\n";
    const task = noteTasks(parseNote("/r/a.md", source))[0];
    expect(apply(source, inboxTaskChange(task, source, "2026-11-12"))).toBe("- [x] a ✅ 2026-11-12\n");
  });
});

describe("tasks.stampCompletion", () => {
  it("defaults to on", () => {
    expect(parseSettings("{}").tasks.stampCompletion).toBe(true);
    expect(parseSettings(JSON.stringify({ tasks: { stampCompletion: false } })).tasks.stampCompletion).toBe(false);
  });
});
