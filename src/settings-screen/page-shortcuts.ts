// Shortcuts page: one row per keymap command, grouped by category. Click a
// shortcut to record; the next key chord binds it, Backspace/Delete unbinds,
// Esc cancels (and does not leave settings). Rows update in place so keyboard
// focus stays on the shortcut button.

import {
  acceleratorFromEvent,
  conflictingIds,
  formatAccelerator,
  KEYMAP_COMMANDS,
  resolveAccelerator,
} from "../keymap";
import type { Settings } from "../settings";
import { button, caption, group, pageHeader, row } from "./controls";
import { shortcutEntryId } from "./registry";
import type { ScreenDeps, SettingsPage } from "./screen";

type Mounted = {
  host: HTMLElement;
  deps: ScreenDeps;
  update: () => void;
};

let recordingId: string | null = null;
let mounted: Mounted | null = null;
let listening = false;

/** Recording only counts while the page is on screen. */
function isLive(): boolean {
  return mounted !== null && mounted.host.isConnected && document.body.classList.contains("settings-active");
}

function setKeymap(deps: ScreenDeps, change: (keymap: Settings["keymap"]) => void): void {
  const settings = deps.getSettings();
  const keymap = { ...settings.keymap };
  change(keymap);
  deps.onSettingsChange({ ...settings, keymap });
}

function stopRecording(): void {
  recordingId = null;
  mounted?.update();
}

// Capture phase on document, so a recording swallows the keystroke before the
// app's global shortcuts and the settings screen's Esc handler see it.
function onKeydownCapture(event: KeyboardEvent): void {
  if (!recordingId) return;
  if (!isLive()) {
    recordingId = null;
    return;
  }
  const { deps } = mounted!;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Escape") {
    stopRecording();
    return;
  }
  const id = recordingId;
  if (event.key === "Backspace" || event.key === "Delete") {
    recordingId = null;
    setKeymap(deps, (keymap) => {
      keymap[id] = "";
    });
    mounted?.update();
    return;
  }
  const accel = acceleratorFromEvent(event);
  if (!accel) return; // modifier-only press: keep recording
  recordingId = null;
  setKeymap(deps, (keymap) => {
    keymap[id] = accel;
  });
  mounted?.update();
}

export const shortcutsPage: SettingsPage = {
  id: "shortcuts",
  blocksEscape: () => recordingId !== null && isLive(),
  render(host, deps) {
    if (!listening) {
      document.addEventListener("keydown", onKeydownCapture, true);
      listening = true;
    }
    // A fresh render (page switch, reopen, sync from another window) ends any recording.
    recordingId = null;
    pageHeader(host, "shortcuts");

    host.append(
      row(
        "restore-default-keys",
        "Defaults",
        "Undo every change on this page.",
        button("Restore Defaults", () => {
          recordingId = null;
          setKeymap(deps, (keymap) => {
            for (const id of Object.keys(keymap)) delete keymap[id];
          });
          update();
        }),
      ),
    );

    const warning = document.createElement("p");
    warning.className = "st-note st-error st-key-warning";
    warning.setAttribute("role", "status");
    host.append(warning);

    const keyButtons = new Map<string, HTMLButtonElement>();
    const categories = [...new Set(KEYMAP_COMMANDS.map((command) => command.category))];
    for (const category of categories) {
      host.append(caption(category));
      for (const command of KEYMAP_COMMANDS.filter((c) => c.category === category)) {
        const keyButton = document.createElement("button");
        keyButton.type = "button";
        keyButton.className = "st-kbd";
        keyButton.addEventListener("click", () => {
          recordingId = recordingId === command.id ? null : command.id;
          update();
        });
        keyButtons.set(command.id, keyButton);
        const reset = button("Reset", () => {
          recordingId = null;
          setKeymap(deps, (keymap) => {
            delete keymap[command.id];
          });
          update();
        });
        reset.title = "Reset to default";
        reset.setAttribute("aria-label", `Reset ${command.label} shortcut`);
        host.append(row(shortcutEntryId(command.id), command.label, null, group(keyButton, reset)));
      }
    }

    function update(): void {
      const keymap = deps.getSettings().keymap;
      const conflicts = conflictingIds(keymap);
      warning.textContent = conflicts.size ? "Some shortcuts are assigned to more than one command." : "";
      for (const command of KEYMAP_COMMANDS) {
        const keyButton = keyButtons.get(command.id)!;
        const accel = resolveAccelerator(command, keymap);
        const recording = recordingId === command.id;
        const conflict = conflicts.has(command.id);
        keyButton.textContent = recording ? "Press keys…" : accel ? formatAccelerator(accel) : "Not set";
        keyButton.classList.toggle("rec", recording);
        keyButton.classList.toggle("empty", !recording && !accel);
        keyButton.classList.toggle("conflict", conflict && !recording);
        keyButton.setAttribute("aria-pressed", String(recording));
        keyButton.title = conflict ? "This shortcut is also used by another command" : "Click to record a new shortcut";
        keyButton.setAttribute(
          "aria-label",
          `${command.label} shortcut: ${recording ? "recording" : accel ? formatAccelerator(accel) : "not set"}`,
        );
      }
    }

    mounted = { host, deps, update };
    update();
  },
};
