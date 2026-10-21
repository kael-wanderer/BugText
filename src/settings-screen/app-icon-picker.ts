// App icon carousel: ‹ preview ›, name, dots. Picking sets the Dock icon first
// and saves `appIcon` only after that succeeds; on failure it snaps back.

import { APP_ICON_IDS, type AppIconId } from "../settings";
import { APP_ICONS } from "./app-icons";
import { caption } from "./controls";
import type { ScreenDeps } from "./screen";

const NOTE = "The Dock shows it while BugText runs. Finder and Launchpad keep the app's own icon.";
const ERROR = "Could not change the Dock icon.";

/** Next / previous icon id, wrapping around both ends. */
export function stepIcon(current: AppIconId, dir: 1 | -1): AppIconId {
  const count = APP_ICON_IDS.length;
  const index = Math.max(0, APP_ICON_IDS.indexOf(current));
  return APP_ICON_IDS[(index + dir + count) % count];
}

function iconLabel(id: AppIconId): string {
  const index = APP_ICON_IDS.indexOf(id);
  const name = APP_ICONS[index]?.name ?? id;
  return `${index + 1} · ${name}${index === 0 ? " (current)" : ""}`;
}

function arrow(text: string, label: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "st-icon-arrow";
  node.textContent = text;
  node.setAttribute("aria-label", label);
  node.addEventListener("click", onClick);
  return node;
}

/** Appends the "App icon" caption, carousel and note to `host`. Hidden off macOS. */
export function mountAppIconPicker(host: HTMLElement, deps: ScreenDeps): void {
  if (!deps.isMac) return;

  let shown: AppIconId = deps.getSettings().appIcon;
  let request = 0;

  const picker = document.createElement("div");
  picker.className = "st-icon-picker";
  picker.dataset.setting = "app-icon";

  const preview = document.createElement("div");
  preview.className = "st-icon-preview";
  preview.setAttribute("role", "img");

  const strip = document.createElement("div");
  strip.className = "st-icon-strip";
  strip.append(
    arrow("‹", "Previous icon", () => pick(stepIcon(shown, -1))),
    preview,
    arrow("›", "Next icon", () => pick(stepIcon(shown, 1))),
  );

  const name = document.createElement("div");
  name.className = "st-icon-name";
  name.setAttribute("aria-live", "polite");

  const dots = document.createElement("div");
  dots.className = "st-icon-dots";
  const dotButtons = APP_ICONS.map((icon) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.setAttribute("aria-label", icon.name);
    dot.addEventListener("click", () => pick(icon.id));
    dots.append(dot);
    return dot;
  });

  const error = document.createElement("div");
  error.className = "st-error st-icon-error";
  error.setAttribute("role", "alert");

  const note = document.createElement("p");
  note.className = "st-note st-icon-note";
  note.textContent = NOTE;

  picker.append(strip, name, dots, error);
  host.append(caption("App icon"), picker, note);

  function show(id: AppIconId): void {
    shown = id;
    const icon = APP_ICONS.find((i) => i.id === id) ?? APP_ICONS[0];
    // Static generated SVG markup (APP_ICONS), never user data.
    preview.innerHTML = icon.svg;
    preview.setAttribute("aria-label", icon.name);
    name.textContent = iconLabel(icon.id);
    dotButtons.forEach((dot, i) => {
      dot.classList.toggle("on", APP_ICON_IDS[i] === icon.id);
      dot.setAttribute("aria-pressed", String(APP_ICON_IDS[i] === icon.id));
    });
  }

  async function pick(id: AppIconId): Promise<void> {
    const ticket = ++request;
    error.textContent = "";
    show(id);
    try {
      await deps.setDockIcon(id);
      if (ticket !== request) return;
      deps.onSettingsChange({ ...deps.getSettings(), appIcon: id });
    } catch {
      if (ticket !== request) return;
      show(deps.getSettings().appIcon);
      error.textContent = ERROR;
    }
  }

  show(shown);
}
