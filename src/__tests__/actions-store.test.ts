import { describe, expect, it, vi } from "vitest";
import { loadActions, parseActions, saveActions } from "../ai/actions-store";
import { actionEngine, runnableActions } from "../ai/actions";
import { DEFAULT_AI_SETTINGS } from "../ai/aisettings";

const action = { id: "one", name: "Translate", instruction: "Translate", result: "edit" as const, input: "note" as const, engine: null, panel: true, extra: 3 };
describe("saved actions", () => {
  it("validates fields and unique names", () => {
    expect(parseActions(JSON.stringify({ version: 1, actions: [action] }))).not.toBeNull();
    expect(parseActions(JSON.stringify({ version: 1, actions: [action, { ...action, id: "two", name: "TRANSLATE" }] }))).toBeNull();
    expect(parseActions(JSON.stringify({ version: 1, actions: [{ ...action, instruction: "x".repeat(8001) }] }))).toBeNull();
    expect(parseActions("{" )).toBeNull();
  });
  it("preserves unknown fields and refuses malformed files without writing", async () => {
    const write = vi.fn(); const broadcast = vi.fn();
    const io = { read: async () => "{", write, broadcast };
    expect(await loadActions(io)).toEqual({ file: null, error: true });
    expect(write).not.toHaveBeenCalled();
    const file = { version: 1 as const, actions: [action], extra: "kept" };
    await expect(saveActions(io, file)).rejects.toThrow();
    await saveActions({ ...io, read: async () => null }, file);
    expect(parseActions(write.mock.calls[0][0])).toEqual(file);
    expect(broadcast).toHaveBeenCalledOnce();
  });
  it("resolves chat at run time and respects an override", () => {
    const settings = structuredClone(DEFAULT_AI_SETTINGS);
    const row = { engine: { kind: "cli" as const, tool: "codex" as const }, model: "model", effort: "" };
    settings.uses.chat = row;
    const items = runnableActions(settings, [action]);
    const item = items[items.length - 1];
    expect(actionEngine(item, settings, [])).toEqual(row);
    expect(actionEngine({ ...item, engine: { engine: { kind: "none" }, model: "", effort: "" } }, settings, []).engine.kind).toBe("none");
  });
});
