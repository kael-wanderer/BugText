// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recipeUI } from "../recipes/sheet";
import type { RunPlan } from "../recipes/run";

let host: HTMLElement;
beforeEach(() => { document.body.replaceChildren(); host = document.createElement("div"); document.body.append(host); });
const buttons = () => [...host.querySelectorAll("button")];
const click = (label: string) => { const b = buttons().find(b => b.textContent === label); expect(b, label).toBeTruthy(); b!.click(); };
const esc = () => host.querySelector(".organize-scrim")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
const plan = (over: Partial<RunPlan> = {}): RunPlan => ({
  name: "Weekly review",
  sources: [{ label: "a.md", chars: 18_000 }, { label: "Completed tasks, last 7 days", chars: 400 }],
  leftOut: [{ path: "sync-proposal-march.md", reason: "superseded" }],
  trimmed: 0, engine: "omlx · Qwen3.8-27B",
  output: { kind: "note", relative: "Reviews/2026-W46.md", exists: true },
  ...over,
});

describe("run sheet", () => {
  it("lists the plan and resolves Run", async () => {
    const ui = recipeUI(host);
    const answer = ui.confirm(plan());
    const text = host.textContent!;
    expect(host.querySelector("h2")!.textContent).toBe('Run "Weekly review"');
    expect(text).toContain("Inputs · 2 notes · 18,400 characters");
    expect(text).toContain("a.md");
    expect(text).toContain("18,000");
    expect(text).toContain("sync-proposal-march.md");
    expect(text).toContain("left out: superseded");
    expect(text).toContain("Engine omlx · Qwen3.8-27B");
    expect(text).toContain("Output Reviews/2026-W46.md · exists, will show a diff");
    expect(document.activeElement?.textContent).toBe("Run");
    click("Run");
    expect(await answer).toBe(true);
  });

  it("resolves false on Cancel and Esc", async () => {
    const ui = recipeUI(host);
    const first = ui.confirm(plan()); click("Cancel"); expect(await first).toBe(false);
    const second = ui.confirm(plan()); esc(); expect(await second).toBe(false);
    expect(host.querySelector(".organize-scrim")).toBeNull();
  });

  it("describes each output and a trimmed context", () => {
    const ui = recipeUI(host);
    void ui.confirm(plan({ output: { kind: "note", relative: "x.md", exists: false } }));
    expect(host.textContent).toContain("Output x.md · new note");
    void ui.confirm(plan({ output: { kind: "chat" } }));
    expect(host.textContent).toContain("Output Chat");
    void ui.confirm(plan({ output: { kind: "properties", relative: "n.md" }, trimmed: 1200 }));
    expect(host.textContent).toContain("Output Properties of n.md · shown as a diff");
    expect(host.textContent).toContain("Context limit: 1,200 characters cut.");
    expect(host.querySelectorAll(".organize-scrim")).toHaveLength(1);
  });

  it("explains each left-out reason", () => {
    const ui = recipeUI(host);
    void ui.confirm(plan({ leftOut: [
      { path: "s.md", reason: "superseded" }, { path: "e.md", reason: "excluded" }, { path: "m.md", reason: "missing" },
      { path: "l.md", reason: "limit" }, { path: "g.md", reason: "generated" },
    ] }));
    const text = host.textContent!;
    for (const reason of ["left out: superseded", "left out: excluded from AI context", "not found", "over 200 notes", "left out: written by this recipe"])
      expect(text).toContain(reason);
  });

  it("renders names as text", () => {
    const ui = recipeUI(host);
    void ui.confirm(plan({ name: "<img src=x onerror=alert(1)>", sources: [{ label: "<img src=y>", chars: 1 }] }));
    expect(host.querySelector("img")).toBeNull();
  });
});

describe("progress", () => {
  it("shows Stop, and Stop and Esc cancel", () => {
    const ui = recipeUI(host);
    const cancel = vi.fn();
    ui.progress("Running…", cancel);
    expect(host.textContent).toContain("Running…");
    click("Stop");
    expect(cancel).toHaveBeenCalledOnce();
    ui.progress("Running…", cancel); esc();
    expect(cancel).toHaveBeenCalledTimes(2);
  });
});

describe("review sheet", () => {
  it("shows a line diff and resolves Accept", async () => {
    const ui = recipeUI(host);
    const answer = ui.review({ path: "/r/Reviews/2026-W46.md", before: "one\ntwo", after: "one\n<img src=x onerror=alert(1)>" });
    const lines = [...host.querySelectorAll(".ai-diff-line")].map(l => l.textContent);
    expect(lines).toContain("  one");
    expect(lines).toContain("- two");
    expect(lines).toContain("+ <img src=x onerror=alert(1)>");
    expect(host.querySelector("img")).toBeNull();
    click("Accept");
    expect(await answer).toBe(true);
    const cancelled = ui.review({ path: "/r/x.md", before: "a", after: "b" }); click("Cancel");
    expect(await cancelled).toBe(false);
  });

  it("shows the new text when the diff is too large", async () => {
    const ui = recipeUI(host);
    const big = Array.from({ length: 2100 }, (_, i) => `line ${i}`).join("\n");
    const answer = ui.review({ path: "/r/x.md", before: big, after: big + "\nmore" });
    expect(host.textContent).toContain("This note is too large to show as a diff.");
    expect(host.querySelector("pre")!.textContent).toContain("more");
    click("Accept");
    expect(await answer).toBe(true);
  });
});

describe("done and fail", () => {
  it("shows the result", () => {
    const notify = vi.fn();
    const ui = recipeUI(host, notify);
    ui.progress("Running…", () => {});
    ui.done("Wrote x.md");
    expect(notify).toHaveBeenCalledWith("Wrote x.md");
    expect(host.querySelector(".organize-scrim")).toBeNull();
    ui.fail("Nothing to send.");
    expect(host.querySelector('[role="alert"]')!.textContent).toBe("Nothing to send.");
    click("OK");
    expect(host.querySelector(".organize-scrim")).toBeNull();
  });
});
