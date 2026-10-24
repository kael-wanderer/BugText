import { describe, expect, it } from "vitest";
import {
  compareVersions,
  parseUpdateFeed,
  shouldCheckForUpdates,
  UPDATE_CHECK_INTERVAL_MS,
} from "../updater";

describe("shouldCheckForUpdates", () => {
  it("manual mode never checks", () => {
    expect(shouldCheckForUpdates(false, null, 100)).toBe(false);
  });

  it("checks immediately when enabled and never checked", () => {
    expect(shouldCheckForUpdates(true, null, 100)).toBe(true);
  });

  it("checks again after one day", () => {
    expect(shouldCheckForUpdates(true, 100, 100 + UPDATE_CHECK_INTERVAL_MS - 1)).toBe(
      false,
    );
    expect(shouldCheckForUpdates(true, 100, 100 + UPDATE_CHECK_INTERVAL_MS)).toBe(
      true,
    );
  });
});

describe("parseUpdateFeed", () => {
  it("reads the version and release page", () => {
    expect(
      parseUpdateFeed('{"version":"0.3.0","release_url":"https://kael.io.vn/api/download/releases/x"}'),
    ).toEqual({ version: "0.3.0", releaseUrl: "https://kael.io.vn/api/download/releases/x" });
  });

  it("drops a release link that is not https", () => {
    expect(parseUpdateFeed('{"version":"0.3.0","release_url":"file:///Applications/X.app"}')).toEqual({
      version: "0.3.0",
      releaseUrl: null,
    });
  });

  it("rejects bodies without a usable version", () => {
    expect(parseUpdateFeed("<html>")).toBeNull();
    expect(parseUpdateFeed('{"version":""}')).toBeNull();
    expect(parseUpdateFeed('{"version":"latest"}')).toBeNull();
    expect(parseUpdateFeed("[]")).toBeNull();
  });
});

describe("compareVersions", () => {
  it("orders by semantic version", () => {
    expect(compareVersions("0.3.1", "0.3.0")).toBeGreaterThan(0);
    expect(compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("0.3.0", "0.3.0")).toBe(0);
    expect(compareVersions("0.2.7", "0.3.0")).toBeLessThan(0);
  });

  it("puts prereleases below the release and orders build numbers numerically", () => {
    expect(compareVersions("0.4.0-beta.1", "0.4.0")).toBeLessThan(0);
    expect(compareVersions("0.4.0-build.110", "0.4.0-build.20")).toBeGreaterThan(0);
    expect(compareVersions("0.4.0-beta.1", "0.3.9")).toBeGreaterThan(0);
  });
});
