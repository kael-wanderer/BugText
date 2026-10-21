import { describe, expect, it } from "vitest";
import type { HttpProvider } from "../ai/aisettings";
import {
  buildAnthropicBody,
  buildHttpBody,
  commandPermissionProfiles,
  parseAnthropicSSEDelta,
  parseSSEDelta,
  resolveCommandPermissionProfile,
} from "../ai/providers";

const provider: HttpProvider = {
  id: "x",
  label: "X",
  type: "http",
  baseUrl: "u",
  model: "m",
};

describe("buildHttpBody", () => {
  it("produces a streaming OpenAI-compatible body", () => {
    const body = buildHttpBody(provider, [{ role: "user", content: "hi" }]) as {
      model: string;
      stream: boolean;
      messages: unknown[];
    };
    expect(body.model).toBe("m");
    expect(body.stream).toBe(true);
    expect(body.messages[0]).toEqual({ role: "user", content: "hi" });
  });

  it("produces a native Anthropic Messages body", () => {
    const body = buildHttpBody(
      { ...provider, api: "anthropic", maxTokens: 2048 },
      [
        { role: "system", content: "System A" },
        { role: "user", content: "hi" },
        { role: "system", content: "System B" },
        { role: "assistant", content: "hello" },
      ],
    ) as ReturnType<typeof buildAnthropicBody>;
    expect(body).toEqual({
      model: "m",
      max_tokens: 2048,
      system: "System A\n\nSystem B",
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
      stream: true,
    });
  });

  it("defaults native Anthropic max tokens to 4096", () => {
    const body = buildAnthropicBody({ ...provider, api: "anthropic" }, []);
    expect(body.max_tokens).toBe(4096);
  });
});

describe("parseSSEDelta", () => {
  it("extracts delta content", () => {
    expect(
      parseSSEDelta('data: {"choices":[{"delta":{"content":"He"}}]}'),
    ).toBe("He");
  });

  it("returns DONE on the terminator", () => {
    expect(parseSSEDelta("data: [DONE]")).toBe("DONE");
  });

  it("returns null for empty or non-data lines", () => {
    expect(parseSSEDelta("")).toBeNull();
    expect(parseSSEDelta(": ping")).toBeNull();
  });
});

describe("parseAnthropicSSEDelta", () => {
  it("extracts text deltas", () => {
    expect(
      parseAnthropicSSEDelta(
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"He"}}',
      ),
    ).toBe("He");
  });

  it("returns DONE on message_stop", () => {
    expect(parseAnthropicSSEDelta('data: {"type":"message_stop"}')).toBe(
      "DONE",
    );
  });

  it("ignores non-text events", () => {
    expect(parseAnthropicSSEDelta('data: {"type":"message_start"}')).toBeNull();
    expect(parseAnthropicSSEDelta("event: ping")).toBeNull();
  });
});

describe("command permission profiles", () => {
  it("creates ask/full-access fallback profiles from run and bypassRun", () => {
    const profiles = commandPermissionProfiles({
      id: "c",
      label: "CLI",
      type: "command",
      run: "cli {prompt}",
      bypassRun: "cli --yes {prompt}",
    });
    expect(profiles).toEqual([
      {
        id: "ask",
        label: "Ask before doing",
        run: "cli {prompt}",
        confirmEachRun: false,
      },
      {
        id: "full-access",
        label: "Full access",
        run: "cli --yes {prompt}",
        confirmEachRun: true,
      },
    ]);
  });

  it("uses custom profiles when present", () => {
    const resolved = resolveCommandPermissionProfile(
      {
        id: "c",
        label: "CLI",
        type: "command",
        run: "cli {prompt}",
        bypassRun: "cli --yes {prompt}",
        permissionProfiles: [
          { id: "read", label: "Read only", run: "cli --read {prompt}" },
          {
            id: "full",
            label: "Full",
            run: "cli --full {prompt}",
            confirmEachRun: true,
          },
        ],
      },
      "full",
    );
    expect(resolved).toEqual({
      id: "full",
      label: "Full",
      run: "cli --full {prompt}",
      confirmEachRun: true,
    });
  });

  it("falls back to the first profile when selection is unavailable", () => {
    const resolved = resolveCommandPermissionProfile(
      {
        id: "c",
        label: "CLI",
        type: "command",
        run: "cli {prompt}",
      },
      "missing",
    );
    expect(resolved).toMatchObject({ id: "ask", run: "cli {prompt}" });
  });
});
