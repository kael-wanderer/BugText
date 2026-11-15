import { describe, expect, it } from "vitest";
import { loadProperties } from "../properties/loader";
import { parseNote } from "../links/index";
import { buildOverview, overviewMarkdown, type OverviewInput } from "../overview/model";
import type { ReviewItem } from "../review/types";
import { DEFAULT_NOTE_TYPES, defaultTypeBody, presetValues, validNoteType } from "../note-types/model";

await loadProperties();
const NOW = new Date(2026, 10, 12, 12).getTime();
const item = (path: string, state: ReviewItem["state"], over: Partial<ReviewItem> = {}): ReviewItem => ({ path, state, digest: "d", changedAt: NOW - 2 * 3600_000, route: "outside", reviewedAt: null, baseline: false, hasText: true, added: 42, removed: 7, ...over });

function input(over: Partial<OverviewInput> = {}): OverviewInput {
  const notes = [
    parseNote("/r/p/plan.md", "---\nstatus: current\n---\n# Project plan\n## Milestones\n- [ ] Send access list due:2026-11-10\n- [ ] Security review #blocker\n- [x] Done thing due:2026-11-01\n"),
    parseNote("/r/p/arch.md", "---\npinned: true\n---\n# Architecture\n- [ ] Draft queue design 📅 2026-11-16\n- [ ] Verify single writer #question\n- [ ] Ask about #questions later\n"),
    parseNote("/r/p/both.md", "---\nstatus: Current\npinned: true\n---\nbody"),
    parseNote("/r/p/d1.md", "---\ntype: decision\ndate: 2026-11-08\n---\n# Use one writer per folder\n\n## Decision\n\nSimpler recovery; MCP clients\nqueue behind the lock.\n\n## Why\n"),
    parseNote("/r/p/d2.md", "---\ntype: Decision\ndate: 2026-11-02\n---\nPull is fast-forward only.\n"),
    parseNote("/r/p/d3.md", "---\ntype: decision\n---\n# Undated\n" + "word ".repeat(80)),
    parseNote("/r/p/bad.md", "---\nx: [\n---\n- [ ] Fix yaml due:2026-11-12\n"),
    parseNote("/r/other/x.md", "---\nstatus: current\n---\n- [ ] Elsewhere #question\n"),
  ];
  return { folder: "/r/p", reviewRoot: "/r", notes, review: [item("p/plan.md", "changed"), item("p/new.md", "new"), item("other/x.md", "changed")], today: "2026-11-12", now: NOW, ...over };
}

describe("buildOverview", () => {
  const o = buildOverview(input());
  it("lists key documents in the folder only", () => {
    expect(o.keyDocs.map(d => [d.name, d.badge, d.review])).toEqual([
      ["arch.md", "pinned", ""],
      ["both.md", "current", ""],
      ["plan.md", "current", "Changed 2 h ago · not reviewed"],
    ]);
  });
  it("lists decisions newest first with title and summary", () => {
    expect(o.decisions.map(d => [d.title, d.date])).toEqual([["Use one writer per folder", "2026-11-08"], ["d2", "2026-11-02"], ["Undated", null]]);
    expect(o.decisions[0].summary).toBe("Simpler recovery; MCP clients queue behind the lock.");
    expect(o.decisions[1].summary).toBe("Pull is fast-forward only.");
    expect(o.decisions[2].summary.length).toBeLessThanOrEqual(201);
    expect(o.decisions[2].summary.endsWith("…")).toBe(true);
  });
  it("lists open questions and blockers by whole tag", () => {
    expect(o.questions.map(t => t.text)).toEqual(["Verify single writer #question", "Security review #blocker"]);
  });
  it("lists next actions: dated soonest first, then undated, at most ten", () => {
    expect(o.next.map(t => t.text).slice(0, 3)).toEqual(["Send access list due:2026-11-10", "Fix yaml due:2026-11-12", "Draft queue design 📅 2026-11-16"]);
    expect(o.next.some(t => t.checked)).toBe(false);
    const many = buildOverview(input({ notes: [parseNote("/r/p/m.md", Array.from({ length: 14 }, (_, i) => `- [ ] t${i}`).join("\n"))] }));
    expect(many.next).toHaveLength(10);
  });
  it("limits changes since review to the folder", () => {
    expect(o.changed.map(i => i.path)).toEqual(["p/plan.md", "p/new.md"]);
  });
  it("skips a note with broken properties in property sections but keeps its tasks", () => {
    expect(o.keyDocs.some(d => d.path.endsWith("bad.md"))).toBe(false);
    expect(o.next.some(t => t.path.endsWith("bad.md"))).toBe(true);
  });
});

describe("overviewMarkdown", () => {
  it("writes every section with links relative to the folder", () => {
    const md = overviewMarkdown(buildOverview(input()));
    for (const heading of ["## Key documents", "## Decisions", "## Open questions and blockers", "## Next actions", "## Changed since review"]) expect(md).toContain(heading);
    expect(md).toContain("- [plan.md](plan.md) · current");
    // Plain bullets: pasted into a note in the folder, they must not become new open tasks.
    expect(md).toContain("- Send access list due:2026-11-10 — [plan.md](plan.md)");
    expect(md).not.toMatch(/^\s*[-*+] \[[ xX]\]/m);
    expect(md).toContain("- [plan.md](plan.md) +42 −7");
    expect(md).toContain("- [new.md](new.md) (new)");
  });
  it("says None. for an empty section", () => {
    const md = overviewMarkdown(buildOverview(input({ notes: [], review: [] })));
    expect(md.match(/None\./g)).toHaveLength(5);
  });
});

describe("Decision note type", () => {
  it("is a default type with type, date and status", () => {
    const decision = DEFAULT_NOTE_TYPES.find(t => t.id === "decision")!;
    expect(validNoteType(decision)).toBe(true);
    expect(presetValues(decision, new Date(2026, 10, 12))).toEqual({ type: "decision", date: "2026-11-12", status: "current" });
    expect(defaultTypeBody("decision")).toContain("## Decision");
    expect(defaultTypeBody("decision")).toContain("## Why");
    expect(defaultTypeBody("decision")).toContain("## Alternatives considered");
  });
});
