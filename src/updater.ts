// Updates are offered, never installed: the hosted feed names the newest
// version and its download page, and a newer version opens that page in the
// browser. Settings ▸ General shows the answer inline; the automatic daily
// check announces a version once, with a notice, and never opens a dialog.

const LAST_CHECK_KEY = "bugtext.updater.lastCheck";
const LAST_NOTIFIED_KEY = "bugtext.updater.lastNotified";
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type UpdateFeed = { version: string; releaseUrl: string | null };

export function shouldCheckForUpdates(
  enabled: boolean,
  lastCheck: number | null,
  now = Date.now(),
): boolean {
  return enabled && (lastCheck === null || now - lastCheck >= UPDATE_CHECK_INTERVAL_MS);
}

/** Reads `{"version": "...", "release_url": "https://..."}`; null when unreadable. */
export function parseUpdateFeed(body: string): UpdateFeed | null {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const { version, release_url: releaseUrl } = data as Record<string, unknown>;
  if (typeof version !== "string" || !parseVersion(version.trim())) return null;
  // Only web pages: the link goes straight to the system opener.
  let url: string | null = null;
  if (typeof releaseUrl === "string") {
    try {
      if (new URL(releaseUrl).protocol === "https:") url = releaseUrl;
    } catch {
      url = null;
    }
  }
  return { version: version.trim(), releaseUrl: url };
}

type ParsedVersion = { core: number[]; pre: string[] };

function parseVersion(version: string): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) return null;
  return { core: match.slice(1, 4).map(Number), pre: match[4] ? match[4].split(".") : [] };
}

/** Semantic-version order: positive when `a` is newer than `b`. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) return left.core[index] - right.core[index];
  }
  // A release outranks its own prereleases.
  if (!left.pre.length || !right.pre.length) return right.pre.length - left.pre.length;
  for (let index = 0; index < Math.max(left.pre.length, right.pre.length); index += 1) {
    const x = left.pre[index];
    const y = right.pre[index];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    if (x === y) continue;
    const xNumber = /^\d+$/.test(x);
    const yNumber = /^\d+$/.test(y);
    if (xNumber && yNumber) return Number(x) - Number(y);
    if (xNumber !== yNumber) return xNumber ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * The version the feed is compared against. The build number becomes a numeric
 * prerelease (`0.4.0-build.254`), so builds of one version order by build and a
 * new build is offered even when the version is unchanged. The feed publishes
 * the same shape; a bare `0.4.0` would outrank every build of itself.
 */
export function appFeedVersion(version: string, build: string | null): string {
  const core = version.trim() || "0";
  const number = build?.trim() ?? "";
  return /^\d+$/.test(number) ? `${core}-build.${Number(number)}` : core;
}

export type UpdateStatus =
  | { kind: "up-to-date" }
  | { kind: "update"; version: string; releaseUrl: string | null }
  | { kind: "failed"; message: string };

export type UpdateSource = {
  fetchFeed(): Promise<string>;
  currentVersion(): Promise<string>;
};

/** One check against the feed. Never throws: a failure is a status. */
export async function fetchUpdateStatus(source: UpdateSource): Promise<UpdateStatus> {
  let body: string;
  try {
    body = await source.fetchFeed();
  } catch (error) {
    const text = error instanceof Error ? error.message : typeof error === "string" ? error : "";
    return { kind: "failed", message: text || "Could not reach the update server. Check your connection." };
  }
  const feed = parseUpdateFeed(body);
  if (!feed) return { kind: "failed", message: "The update feed could not be read, so no version was compared." };
  const current = await source.currentVersion();
  return compareVersions(feed.version, current) > 0
    ? { kind: "update", version: feed.version, releaseUrl: feed.releaseUrl }
    : { kind: "up-to-date" };
}

/** A feed version for people: `0.4.0-build.254` reads as `0.4.0 (254)`. */
export function displayVersion(version: string): string {
  const match = /^v?(\d+\.\d+\.\d+)-build\.(\d+)$/.exec(version);
  return match ? `${match[1]} (${match[2]})` : version;
}

export type UpdateCheckState = { kind: "idle" } | { kind: "checking" } | UpdateStatus;

/** What the Settings button says in each state. A failure says Retry, never "up to date". */
export function updateButtonLabel(state: UpdateCheckState): string {
  switch (state.kind) {
    case "checking": return "Checking…";
    case "failed": return "Retry";
    case "up-to-date": return "Check Again";
    case "update": return state.releaseUrl ? `Download ${displayVersion(state.version)}` : "Check Again";
    default: return "Check Now";
  }
}

/** The line under the Settings row, or null when the button says enough. */
export function updateStatusText(state: UpdateCheckState): string | null {
  switch (state.kind) {
    case "failed": return state.message;
    case "up-to-date": return "BugText is up to date.";
    case "update":
      return state.releaseUrl
        ? `BugText ${displayVersion(state.version)} is available.`
        : `BugText ${displayVersion(state.version)} is available, but the feed names no download page.`;
    default: return null;
  }
}

/** Results older than this are checked again when Settings ▸ General opens. */
export const UPDATE_RESULT_FRESH_MS = 5 * 60 * 1000;

/**
 * The Settings check: one state shared by every render of the page, so a page
 * rebuilt by another setting shows the same answer instead of checking again.
 */
export type UpdateCheck = {
  state(): UpdateCheckState;
  /** Checks now unless a check is running. */
  check(): Promise<void>;
  /** Checks when nothing was checked yet or the answer is stale. */
  checkIfStale(): void;
  /** One listener: the page that is on screen. */
  onChange(listener: (() => void) | null): void;
};

export function createUpdateCheck(source: UpdateSource, now: () => number = Date.now): UpdateCheck {
  let state: UpdateCheckState = { kind: "idle" };
  let checkedAt = 0;
  let listener: (() => void) | null = null;
  const set = (next: UpdateCheckState): void => {
    state = next;
    listener?.();
  };
  const check = async (): Promise<void> => {
    if (state.kind === "checking") return;
    set({ kind: "checking" });
    const result = await fetchUpdateStatus(source);
    checkedAt = now();
    set(result);
  };
  return {
    state: () => state,
    check,
    checkIfStale() {
      if (state.kind === "checking") return;
      if (state.kind === "idle" || now() - checkedAt >= UPDATE_RESULT_FRESH_MS) void check();
    },
    onChange(next) {
      listener = next;
    },
  };
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Without storage the next automatic check simply comes sooner.
  }
}

function readLastCheck(): number | null {
  const value = Number(readStored(LAST_CHECK_KEY));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** True when this version was not announced yet; records it as announced. */
export function claimUpdateNotice(version: string): boolean {
  if (readStored(LAST_NOTIFIED_KEY) === version) return false;
  writeStored(LAST_NOTIFIED_KEY, version);
  return true;
}

/**
 * Automatic checks: at launch and hourly, each at most once a day. A newer
 * version is announced once through `notify`; failures stay silent.
 */
export function startDailyUpdateChecks(
  isEnabled: () => boolean,
  source: UpdateSource,
  notify: (update: { version: string; releaseUrl: string | null }) => void,
): () => void {
  const run = async (): Promise<void> => {
    if (!shouldCheckForUpdates(isEnabled(), readLastCheck())) return;
    writeStored(LAST_CHECK_KEY, String(Date.now()));
    const status = await fetchUpdateStatus(source);
    if (status.kind === "update" && claimUpdateNotice(status.version)) notify(status);
  };
  void run();
  const timer = globalThis.setInterval(() => void run(), 60 * 60 * 1000);
  return () => globalThis.clearInterval(timer);
}
