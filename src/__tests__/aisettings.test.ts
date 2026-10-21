import { describe, expect, it } from "vitest";
import {
  DEFAULT_AI_SETTINGS,
  parseAISettings,
  tryParseAISettings,
} from "../ai/aisettings";

describe("parseAISettings", () => {
  it("returns defaults for invalid JSON", () => {
    expect(parseAISettings("nope")).toEqual(DEFAULT_AI_SETTINGS);
  });

  it("drops only the bad connection", () => {
    const settings = parseAISettings(
      JSON.stringify({
        version: 2,
        connections: [
          {
            id: "valid",
            name: "Valid",
            provider: "openai-compatible",
            baseUrl: "https://example.com/v1",
            auth: "bearer",
            textModel: "m1",
          },
          { id: "x" },
          {
            id: "cli-claude",
            name: "Bad id",
            provider: "openai-compatible",
            baseUrl: "https://example.com/v1",
            auth: "bearer",
            textModel: "m1",
          },
          {
            id: "unknown-provider",
            name: "Bad provider",
            provider: "weird",
            baseUrl: "https://example.com/v1",
            auth: "bearer",
            textModel: "m1",
          },
        ],
      }),
    );
    expect(settings.connections.map((connection) => connection.id)).toEqual([
      "valid",
    ]);
  });

  it("lowercases ids and caps at 20", () => {
    const connections = Array.from({ length: 25 }, (_, index) => ({
      id: `CONNECTION-${index}`,
      name: `Connection ${index}`,
      provider: "openai-compatible",
      baseUrl: "https://example.com/v1",
      auth: "bearer",
      textModel: "m1",
    }));
    const settings = parseAISettings(
      JSON.stringify({ version: 2, connections }),
    );
    expect(settings.connections).toHaveLength(20);
    expect(settings.connections[0].id).toBe("connection-0");
  });

  it("rejects http to non-localhost", () => {
    const settings = parseAISettings(
      JSON.stringify({
        version: 2,
        connections: [
          {
            id: "remote",
            name: "Remote",
            provider: "openai-compatible",
            baseUrl: "http://10.0.0.5/v1",
            auth: "none",
            textModel: "m1",
          },
          {
            id: "local",
            name: "Local",
            provider: "openai-compatible",
            baseUrl: "http://localhost:1234/v1",
            auth: "none",
            textModel: "m1",
          },
          {
            id: "secure",
            name: "Secure",
            provider: "openai-compatible",
            baseUrl: "https://x.y/v1",
            auth: "bearer",
            textModel: "m1",
          },
        ],
      }),
    );
    expect(settings.connections.map((connection) => connection.id)).toEqual([
      "local",
      "secure",
    ]);
  });

  it("keeps a use row pointing at a missing connection", () => {
    const settings = parseAISettings(
      JSON.stringify({
        version: 2,
        uses: {
          chat: {
            engine: { kind: "api", connectionId: "gone" },
            model: "",
            effort: "",
          },
        },
      }),
    );
    expect(settings.uses.chat?.engine).toEqual({
      kind: "api",
      connectionId: "gone",
    });
  });

  it("keeps unknown effort/model strings and replaces non-strings", () => {
    const settings = parseAISettings(
      JSON.stringify({
        version: 2,
        uses: {
          chat: {
            engine: { kind: "none" },
            model: "future-model",
            effort: "future-effort",
          },
          rewrite: {
            engine: { kind: "none" },
            model: 42,
            effort: null,
          },
        },
      }),
    );
    expect(settings.uses.chat).toMatchObject({
      model: "future-model",
      effort: "future-effort",
    });
    expect(settings.uses.rewrite).toMatchObject({ model: "", effort: "" });
  });

  it("clamps maxContextChars", () => {
    expect(
      parseAISettings(JSON.stringify({ version: 2, maxContextChars: 10 }))
        .maxContextChars,
    ).toBe(4000);
    expect(
      parseAISettings(JSON.stringify({ version: 2, maxContextChars: 9e9 }))
        .maxContextChars,
    ).toBe(2_000_000);
  });
});

describe("tryParseAISettings", () => {
  it("returns null on invalid JSON", () => {
    expect(tryParseAISettings("{ not json")).toBeNull();
    expect(tryParseAISettings("[]")).toBeNull();
  });

  it("parses valid JSON like parseAISettings", () => {
    const raw = JSON.stringify({ version: 2, connections: [] });
    expect(tryParseAISettings(raw)).toEqual(parseAISettings(raw));
  });
});

it("keeps an IPv6 loopback connection after settings reload", () => {
  const connection = {
    id: "ipv6",
    name: "Local IPv6",
    provider: "openai-compatible",
    baseUrl: "http://[::1]:8080/v1",
    auth: "none",
    textModel: "m",
  };
  expect(
    parseAISettings(JSON.stringify({ version: 2, connections: [connection] }))
      .connections,
  ).toEqual([connection]);
});
