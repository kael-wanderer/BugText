// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { pickExcerpts } from "../ai/superseded";
import { parseAISettings } from "../ai/aisettings";
import { buildMessages } from "../ai/conversation";
import { renderContextSent } from "../ai/context-sent";

const chunk = (path: string, n: number) => ({ path, heading: "H", text: `t${n}` });

describe("pickExcerpts", () => {
  const pool = [chunk("a.md", 1), chunk("s.md", 1), chunk("a.md", 2), chunk("s.md", 2), chunk("a.md", 3)];
  const isSuperseded = (path: string) => path === "s.md";
  it("leaves superseded notes out and keeps k excerpts", () => {
    const picked = pickExcerpts(pool, 2, isSuperseded, false);
    expect(picked.kept.map(c => c.text)).toEqual(["t1", "t2"]);
    expect(picked.kept.every(c => c.path === "a.md")).toBe(true);
    expect(picked.leftOut).toEqual(["s.md"]);
  });
  it("labels them when included", () => {
    const picked = pickExcerpts(pool, 2, isSuperseded, true);
    expect(picked.kept.map(c => c.path)).toEqual(["a.md", "s.md"]);
    expect(picked.kept[1].superseded).toBe(true);
    expect(picked.kept[0].superseded).toBeUndefined();
    expect(picked.leftOut).toEqual([]);
  });
});

describe("Include superseded notes setting", () => {
  it("defaults to off and accepts only true", () => {
    expect(parseAISettings("{}").context.includeSuperseded).toBe(false);
    expect(parseAISettings(JSON.stringify({ version: 2, context: { exclude: [], includeSuperseded: true } })).context.includeSuperseded).toBe(true);
    expect(parseAISettings(JSON.stringify({ version: 2, context: { includeSuperseded: "yes" } })).context.includeSuperseded).toBe(false);
  });
});

describe("superseded excerpts in messages and the context record", () => {
  it("marks a superseded excerpt", () => {
    const built = buildMessages({ history: [], prompt: "Ask", docText: "", selection: "", editMode: false, retrieved: [{ path: "s.md", heading: "H", text: "old", superseded: true }], maxContextChars: 4000 });
    const content = built.messages.map(m => String(m.content)).join("\n");
    expect(content).toContain('<context source="s.md#H" status="superseded">');
    expect(built.context.excerpts[0].superseded).toBe(true);
  });
  it("lists notes left out, as text, and still renders older records", () => {
    const view = renderContextSent({ excerpts: [], files: [], trimmed: 0, leftOut: [{ path: "/r/<img src=x>.md" }] }, vi.fn())!;
    expect(view.textContent).toContain("Left out 1 superseded note: <img src=x>.md");
    expect(view.querySelector("img")).toBeNull();
    const two = renderContextSent({ excerpts: [], files: [], trimmed: 0, leftOut: [{ path: "a.md" }, { path: "b.md" }] }, vi.fn())!;
    expect(two.textContent).toContain("Left out 2 superseded notes: a.md, b.md");
    expect(renderContextSent({ excerpts: [], files: [], trimmed: 0 }, vi.fn())).not.toBeNull();
  });
  it("marks an included superseded note in the record", () => {
    const view = renderContextSent({ excerpts: [{ path: "/r/old.md", chars: 5, superseded: true }, { path: "/r/new.md", chars: 5 }], files: [], trimmed: 0 }, vi.fn())!;
    const links = [...view.querySelectorAll("button")].map(b => b.textContent);
    expect(links).toEqual(["/r/old.md", "/r/new.md"]);
    expect(view.querySelector("li")!.textContent).toContain("/r/old.md (superseded)");
    expect(view.textContent).not.toContain("/r/new.md (superseded)");
  });
});

import { searchSettings } from "../settings-screen/registry";
import { renderContext } from "../settings-screen/page-ai-context";
import { DEFAULT_AI_SETTINGS } from "../ai/aisettings";
import { DEFAULT_SETTINGS } from "../settings";
describe("Settings ▸ AI ▸ Context", () => {
  it("has a searchable Include superseded notes switch", () => {
    expect(searchSettings("superseded").some(h => h.kind === "setting" && h.id === "context-superseded")).toBe(true);
    const host = document.createElement("div"); const change = vi.fn();
    renderContext(host, { getAISettings: () => structuredClone(DEFAULT_AI_SETTINGS), getSettings: () => DEFAULT_SETTINGS, onAISettingsChange: change, onSettingsChange: vi.fn() });
    const box = host.querySelector<HTMLInputElement>('[data-setting="context-superseded"] input[type="checkbox"]') ?? host.querySelector<HTMLInputElement>('input[aria-label="Include superseded notes"]')!;
    expect(box.checked).toBe(false);
    box.checked = true; box.dispatchEvent(new Event("change"));
    expect(change.mock.calls[0][0].context.includeSuperseded).toBe(true);
  });
  it("describes the tag the way it is sent", () => {
    const host = document.createElement("div");
    renderContext(host, { getAISettings: () => structuredClone(DEFAULT_AI_SETTINGS), getSettings: () => DEFAULT_SETTINGS, onAISettingsChange: vi.fn(), onSettingsChange: vi.fn() });
    const text = host.querySelector('[data-setting="context-superseded"]')?.textContent ?? host.textContent ?? "";
    expect(text).not.toContain("[superseded]");
    expect(text).toContain('status="superseded"');
  });
});
