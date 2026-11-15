import { describe, expect, it } from "vitest";
import { lifecycleOf, localToday, reviewDue, shortDate, supersedeTarget } from "../lifecycle/model";

describe("lifecycleOf", () => {
  it("reads the three properties", () => {
    expect(lifecycleOf({ status: " Superseded ", superseded_by: "[Design](sync-design.md)", review_by: "2026-11-01" }))
      .toEqual({ status: "superseded", supersededBy: "sync-design.md", reviewBy: "2026-11-01" });
  });
  it("ignores other status values, lists and missing properties", () => {
    expect(lifecycleOf({ status: "archived" }).status).toBeNull();
    expect(lifecycleOf({ status: ["current"] }).status).toBeNull();
    expect(lifecycleOf({ status: "Draft" }).status).toBe("draft");
    expect(lifecycleOf(null)).toEqual({ status: null, supersededBy: null, reviewBy: null });
  });
  it("accepts a Date and refuses impossible or free-text dates", () => {
    expect(lifecycleOf({ review_by: new Date(2026, 10, 1) }).reviewBy).toBe("2026-11-01");
    expect(lifecycleOf({ review_by: "soon" }).reviewBy).toBeNull();
    expect(lifecycleOf({ review_by: "2026-02-30" }).reviewBy).toBeNull();
    expect(lifecycleOf({ superseded_by: 3 }).supersededBy).toBeNull();
  });
});

describe("supersedeTarget", () => {
  it("takes a path or a Markdown link", () => {
    expect(supersedeTarget("a.md")).toBe("a.md");
    expect(supersedeTarget("[A](docs/a.md)")).toBe("docs/a.md");
    expect(supersedeTarget("<a b.md>")).toBe("a b.md");
    expect(supersedeTarget("  ")).toBeNull();
  });
});

describe("dates", () => {
  it("is due only after the date", () => {
    expect(reviewDue("2026-11-14", "2026-11-15")).toBe(true);
    expect(reviewDue("2026-11-15", "2026-11-15")).toBe(false);
    expect(reviewDue(null, "2026-11-15")).toBe(false);
  });
  it("formats a short date, with the year when it differs", () => {
    expect(shortDate("2026-11-01", "2026-11-15")).toBe("1 Nov");
    expect(shortDate("2026-11-01", "2027-01-02")).toBe("1 Nov 2026");
  });
  it("gives today's local date", () => {
    expect(localToday(new Date(2026, 10, 5, 23, 59))).toBe("2026-11-05");
  });
});
