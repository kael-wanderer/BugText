import { describe, expect, it } from "vitest";
import { DEFAULT_AI_SETTINGS } from "../ai/aisettings";
import {
  clampContextChars,
  cloneAISettings,
  isLocalBaseUrl,
  stepContextK,
  terminalUniqueId,
  uniqueId,
} from "../settings-screen/ai-helpers";

describe("AI page helpers", () => {
  it("files-per-chat stepper clamps 1..20", () => {
    expect(stepContextK(20, +1)).toBe(20);
    expect(stepContextK(1, -1)).toBe(1);
    expect(stepContextK(5, +1)).toBe(6);
  });

  it("uniqueId still de-duplicates", () => {
    expect(uniqueId("Claude Code", { ...DEFAULT_AI_SETTINGS, providers: [{ id: "claude-code" } as any] })).toBe(
      "claude-code-2",
    );
    expect(uniqueId("  !!  ", { ...DEFAULT_AI_SETTINGS, providers: [] })).toBe("provider");
  });

  it("terminalUniqueId suffixes -term and de-duplicates", () => {
    const settings = { ...DEFAULT_AI_SETTINGS, terminals: [{ id: "zsh-term", label: "zsh", run: "zsh" }] };
    expect(terminalUniqueId("zsh", settings)).toBe("zsh-term-2");
    expect(terminalUniqueId("", { ...DEFAULT_AI_SETTINGS, terminals: [] })).toBe("terminal-term");
  });

  it("cloneAISettings copies providers and terminals", () => {
    const copy = cloneAISettings(DEFAULT_AI_SETTINGS);
    copy.providers[0].label = "changed";
    copy.terminals.push({ id: "x", label: "x", run: "x" });
    expect(DEFAULT_AI_SETTINGS.providers[0].label).not.toBe("changed");
    expect(DEFAULT_AI_SETTINGS.terminals.some((t) => t.id === "x")).toBe(false);
  });

  it("max context characters clamps 4,000..2,000,000 and rejects non-numbers", () => {
    expect(clampContextChars(10)).toBe(4_000);
    expect(clampContextChars(5_000_000)).toBe(2_000_000);
    expect(clampContextChars(150_000.4)).toBe(150_000);
    expect(clampContextChars(Number.NaN)).toBe(120_000);
    expect(clampContextChars(Number.POSITIVE_INFINITY)).toBe(120_000);
  });

  it("isLocalBaseUrl recognises loopback hosts only", () => {
    expect(isLocalBaseUrl("http://localhost:11434/v1")).toBe(true);
    expect(isLocalBaseUrl("http://127.0.0.1:1234/v1")).toBe(true);
    expect(isLocalBaseUrl("https://api.openai.com/v1")).toBe(false);
    expect(isLocalBaseUrl("not a url")).toBe(false);
  });
});
