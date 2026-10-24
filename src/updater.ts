import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { confirm, message } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";

// Updates are offered, never installed: the hosted feed names the newest
// version and its download page, and a newer version opens that page in the
// browser.

const LAST_CHECK_KEY = "bugtext.updater.lastCheck";
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

function readLastCheck(): number | null {
  try {
    const value = Number(localStorage.getItem(LAST_CHECK_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function recordCheck(now = Date.now()): void {
  try {
    localStorage.setItem(LAST_CHECK_KEY, String(now));
  } catch {
    // Without storage the next automatic check simply comes sooner.
  }
}

export async function checkForUpdates(interactive = true): Promise<void> {
  recordCheck();
  try {
    const feed = parseUpdateFeed(await invoke<string>("update_feed_fetch"));
    if (!feed) throw new Error("The update feed could not be read, so no version was compared.");
    const current = await getVersion();
    if (compareVersions(feed.version, current) <= 0) {
      if (interactive) {
        await message(`BugText ${current} is the latest version.`, {
          title: "Check for Updates",
          kind: "info",
        });
      }
      return;
    }
    if (!feed.releaseUrl) {
      await message(`BugText ${feed.version} is available. You have ${current}.`, {
        title: "Update Available",
        kind: "info",
      });
      return;
    }
    const accepted = await confirm(
      `BugText ${feed.version} is available. You have ${current}.\n\nOpen the download page?`,
      { title: "Update Available", kind: "info", okLabel: "Download", cancelLabel: "Later" },
    );
    if (accepted) await openUrl(feed.releaseUrl);
  } catch (error) {
    if (interactive) {
      await message(error instanceof Error ? error.message : String(error), {
        title: "Unable to Check for Updates",
        kind: "error",
      });
    }
  }
}

export function startDailyUpdateChecks(isEnabled: () => boolean): () => void {
  const run = (): void => {
    if (shouldCheckForUpdates(isEnabled(), readLastCheck())) {
      void checkForUpdates(false);
    }
  };
  run();
  const timer = window.setInterval(run, 60 * 60 * 1000);
  return () => window.clearInterval(timer);
}
