import { invoke } from "@tauri-apps/api/core";
import { confirm, message } from "@tauri-apps/plugin-dialog";
import { check } from "@tauri-apps/plugin-updater";

const LAST_CHECK_KEY = "bugter.updater.lastCheck";
const LEGACY_LAST_CHECK_KEY = "mdflow.updater.lastCheck";
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function shouldCheckForUpdates(
  enabled: boolean,
  lastCheck: number | null,
  now = Date.now(),
): boolean {
  return enabled && (lastCheck === null || now - lastCheck >= UPDATE_CHECK_INTERVAL_MS);
}

function readLastCheck(): number | null {
  const value = Number(
    localStorage.getItem(LAST_CHECK_KEY) ?? localStorage.getItem(LEGACY_LAST_CHECK_KEY),
  );
  return Number.isFinite(value) && value > 0 ? value : null;
}

function recordCheck(now = Date.now()): void {
  localStorage.setItem(LAST_CHECK_KEY, String(now));
}

function updaterError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  if (/endpoint|pubkey|public key|release json|configuration/i.test(detail)) {
    return "Updates are not configured for this build yet. Add the signed release-feed URL and updater public key to src-tauri/tauri.conf.json.";
  }
  return detail;
}

export async function checkForUpdates(interactive = true): Promise<void> {
  recordCheck();
  try {
    const update = await check({ timeout: 20_000 });
    if (!update) {
      if (interactive) {
        await message("Bugter is up to date.", {
          title: "Check for Updates",
          kind: "info",
        });
      }
      return;
    }

    const accepted = await confirm(
      `Bugter ${update.version} is available${
        update.body ? `.\n\n${update.body}` : "."
      }\n\nDownload and install it now?`,
      {
        title: "Update Available",
        kind: "info",
        okLabel: "Update",
        cancelLabel: "Later",
      },
    );
    if (!accepted) return;

    await update.downloadAndInstall();
    await message("The update is installed. Bugter will restart now.", {
      title: "Update Complete",
      kind: "info",
    });
    await invoke("restart_app");
  } catch (error) {
    if (interactive) {
      await message(updaterError(error), {
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
