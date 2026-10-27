import { button, caption, clampStep, pageHeader, row, segmented, stepper } from "./controls";
import type { SettingsPage } from "./screen";
import { DEFAULT_SETTINGS, type Settings } from "../settings";

export type Zone = "explorer" | "main" | "sub";

export const SIZE_MIN = 10;
export const SIZE_MAX = 28;
export const WRAP_MIN = 20;
export const WRAP_MAX = 200;
export const WRAP_DEFAULT = DEFAULT_SETTINGS.wrapColumn;

export function defaultZoneSize(zone: Zone): number {
  return DEFAULT_SETTINGS[zone].size;
}

export function stepZoneSize(size: number, delta: number): number {
  return clampStep(size, delta, SIZE_MIN, SIZE_MAX);
}

export function stepWrapColumn(column: number, delta: number): number {
  return clampStep(column, delta, WRAP_MIN, WRAP_MAX);
}

export const editingPage: SettingsPage = {
  id: "editing",
  render(host, deps) {
    pageHeader(host, "editing");
    const settings = deps.getSettings();
    // Fonts and sizes have one home, General; this row leads there.
    const fonts = row(
      "editing-fonts",
      "Fonts and sizes",
      "Editor, Sub Editor, File Explorer and app fonts are set in General.",
      button("Open General ▸ Typography", () => deps.openPage?.("general", "main-text-size")),
    );
    host.append(
      caption("Text"),
      fonts,
      caption("Wrapping"),
      row(
        "soft-wrap",
        "Soft wrap",
        "Also in View ▸ Soft Wrap.",
        segmented<Settings["softWrapMode"]>(
          "Soft wrap",
          [
            { value: "off", label: "Off" },
            { value: "window", label: "Window" },
            { value: "guide", label: "Guide" },
          ],
          settings.softWrapMode,
          (value) => deps.onSettingsChange({ ...deps.getSettings(), softWrapMode: value }),
        ),
      ),
      row(
        "wrap-column",
        "Wrap column",
        "Where the Guide mode wraps lines.",
        stepper({
          ariaLabel: "Wrap column",
          value: settings.wrapColumn,
          min: WRAP_MIN,
          max: WRAP_MAX,
          resetTo: WRAP_DEFAULT,
          onChange: (wrapColumn) => deps.onSettingsChange({ ...deps.getSettings(), wrapColumn }),
        }),
      ),
    );
  },
};
