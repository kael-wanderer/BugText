import { describe, expect, it } from "vitest";
import { connectionDetail } from "../ai/client";

describe("connectionDetail", () => {
  it("accepts successful responses", () => {
    expect(connectionDetail(200, "")).toEqual({ ok: true, detail: "OK" });
  });

  it("explains rejected credentials and missing endpoints", () => {
    expect(connectionDetail(401, "nope").detail).toContain(
      "The key was rejected.",
    );
    expect(connectionDetail(404, "nope").detail).toContain("No such endpoint");
  });

  it("includes the status without leaking response text", () => {
    const result = connectionDetail(500, "boom");
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("500");
    expect(result.detail).not.toContain("boom");
  });
});
