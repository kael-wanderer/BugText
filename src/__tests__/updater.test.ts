import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installTestDom } from "./setup";
import {
  appFeedVersion,
  claimUpdateNotice,
  compareVersions,
  createUpdateCheck,
  displayVersion,
  fetchUpdateStatus,
  parseUpdateFeed,
  startDailyUpdateChecks,
  updateButtonLabel,
  updateStatusText,
  UPDATE_RESULT_FRESH_MS,
  type UpdateSource,
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

const feed = (version: string, url = "https://kael.io.vn/api/download/releases/x") =>
  JSON.stringify({ version, release_url: url });
const source = (body: string | Error, current = "0.4.0-build.253"): UpdateSource => ({
  fetchFeed: () => (body instanceof Error ? Promise.reject(body) : Promise.resolve(body)),
  currentVersion: () => Promise.resolve(current),
});

describe("appFeedVersion", () => {
  it("adds the build as a numeric prerelease", () => {
    expect(appFeedVersion("0.4.0", "254")).toBe("0.4.0-build.254");
  });

  it("falls back to the version when the build is missing or not a number", () => {
    expect(appFeedVersion("0.4.0", null)).toBe("0.4.0");
    expect(appFeedVersion("0.4.0", "abc")).toBe("0.4.0");
    expect(appFeedVersion("", null)).toBe("0");
  });
});

describe("fetchUpdateStatus", () => {
  it("offers a new build of the same version", async () => {
    expect(await fetchUpdateStatus(source(feed("0.4.0-build.254")))).toEqual({
      kind: "update",
      version: "0.4.0-build.254",
      releaseUrl: "https://kael.io.vn/api/download/releases/x",
    });
  });

  it("is up to date on the same or an older build", async () => {
    expect(await fetchUpdateStatus(source(feed("0.4.0-build.253")))).toEqual({ kind: "up-to-date" });
    expect(await fetchUpdateStatus(source(feed("0.3.3-build.250")))).toEqual({ kind: "up-to-date" });
  });

  it("reports an unreachable feed as a failure, never as up to date", async () => {
    expect(await fetchUpdateStatus(source(new Error("Could not reach the update server. Check your connection.")))).toEqual({
      kind: "failed",
      message: "Could not reach the update server. Check your connection.",
    });
  });

  it("reports a Rust error string as the failure text", async () => {
    const rejecting: UpdateSource = { fetchFeed: () => Promise.reject("The update server answered with status 404."), currentVersion: async () => "0.4.0" };
    expect(await fetchUpdateStatus(rejecting)).toEqual({ kind: "failed", message: "The update server answered with status 404." });
  });

  it("reports an unreadable feed as a failure", async () => {
    expect((await fetchUpdateStatus(source("<html>"))).kind).toBe("failed");
  });

  it("keeps an update whose download link was rejected, without a link", async () => {
    expect(await fetchUpdateStatus(source(feed("0.5.0", "file:///Applications/X.app")))).toEqual({
      kind: "update",
      version: "0.5.0",
      releaseUrl: null,
    });
  });
});

describe("update check labels", () => {
  it("names each state", () => {
    expect(updateButtonLabel({ kind: "idle" })).toBe("Check Now");
    expect(updateButtonLabel({ kind: "checking" })).toBe("Checking…");
    expect(updateButtonLabel({ kind: "failed", message: "x" })).toBe("Retry");
    expect(updateButtonLabel({ kind: "up-to-date" })).toBe("Check Again");
    expect(updateButtonLabel({ kind: "update", version: "0.4.0-build.254", releaseUrl: "https://a" })).toBe("Download 0.4.0 (254)");
    expect(updateButtonLabel({ kind: "update", version: "0.5.0", releaseUrl: null })).toBe("Check Again");
  });

  it("explains the answer under the row", () => {
    expect(updateStatusText({ kind: "idle" })).toBeNull();
    expect(updateStatusText({ kind: "failed", message: "No network." })).toBe("No network.");
    expect(updateStatusText({ kind: "up-to-date" })).toBe("BugText is up to date.");
    expect(updateStatusText({ kind: "update", version: "0.5.0", releaseUrl: null })).toContain("names no download page");
    expect(displayVersion("0.5.0")).toBe("0.5.0");
  });
});

describe("createUpdateCheck", () => {
  it("runs one check at a time and tells its listener", async () => {
    let release!: (body: string) => void;
    const fetchFeed = vi.fn(() => new Promise<string>((resolve) => { release = resolve; }));
    const check = createUpdateCheck({ fetchFeed, currentVersion: async () => "0.4.0-build.253" });
    const seen: string[] = [];
    check.onChange(() => seen.push(check.state().kind));
    const first = check.check();
    void check.check();
    check.checkIfStale();
    expect(fetchFeed).toHaveBeenCalledTimes(1);
    release(feed("0.4.0-build.254"));
    await first;
    expect(seen).toEqual(["checking", "update"]);
  });

  it("checks again on open only when the answer is stale", async () => {
    let now = 1_000;
    const fetchFeed = vi.fn(async () => feed("0.4.0-build.253"));
    const check = createUpdateCheck({ fetchFeed, currentVersion: async () => "0.4.0-build.253" }, () => now);
    check.checkIfStale();
    await vi.waitFor(() => expect(check.state().kind).toBe("up-to-date"));
    check.checkIfStale();
    expect(fetchFeed).toHaveBeenCalledTimes(1);
    now += UPDATE_RESULT_FRESH_MS;
    check.checkIfStale();
    expect(fetchFeed).toHaveBeenCalledTimes(2);
  });
});

describe("automatic checks", () => {
  beforeEach(() => {
    installTestDom();
    localStorage.clear();
  });
  afterEach(() => localStorage.clear());

  it("announces a version once", () => {
    expect(claimUpdateNotice("0.4.0-build.254")).toBe(true);
    expect(claimUpdateNotice("0.4.0-build.254")).toBe(false);
    expect(claimUpdateNotice("0.4.0-build.255")).toBe(true);
  });

  it("notifies on a new version and stays quiet on failure or when off", async () => {
    const notify = vi.fn();
    const stop = startDailyUpdateChecks(() => true, source(feed("0.4.0-build.254")), notify);
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    stop();
    expect(notify.mock.calls[0][0]).toMatchObject({ version: "0.4.0-build.254" });

    localStorage.clear();
    const quiet = vi.fn();
    startDailyUpdateChecks(() => true, source(new Error("offline")), quiet)();
    startDailyUpdateChecks(() => false, source(feed("9.0.0")), quiet)();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(quiet).not.toHaveBeenCalled();
  });
});
