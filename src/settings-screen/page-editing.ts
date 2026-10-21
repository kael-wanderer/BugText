import { caption, clampStep, group, pageHeader, row, segmented, select, stepper, textInput, button } from "./controls";
import { FONT_OPTIONS } from "./fonts";
import type { SettingsPage } from "./screen";
import type { Settings } from "../settings";

export type Zone = "explorer" | "main" | "sub";

export const SIZE_MIN = 10;
export const SIZE_MAX = 28;
export const WRAP_MIN = 20;
export const WRAP_MAX = 200;
export const WRAP_DEFAULT = 80;

export function defaultZoneSize(zone: Zone): number {
  return zone === "explorer" ? 13 : 15;
}

export function stepZoneSize(size: number, delta: number): number {
  return clampStep(size, delta, SIZE_MIN, SIZE_MAX);
}

export function stepWrapColumn(column: number, delta: number): number {
  return clampStep(column, delta, WRAP_MIN, WRAP_MAX);
}

const CUSTOM = "__custom__";
const ZONE_LABEL: Record<Zone, string> = { explorer: "Explorer", main: "Main", sub: "Sub" };

// Chosen area survives re-renders and visits for the session.
let activeZone: Zone = "main";

function withZone(settings: Settings, zone: Zone, patch: Partial<Settings["main"]>): Settings {
  return { ...settings, [zone]: { ...settings[zone], ...patch } };
}

export const editingPage: SettingsPage = {
  id: "editing",
  render(host, deps) {
    // Font select / custom field visibility is local; settings stay the source of truth.
    let customOpen = false;

    function draw(): void {
      host.replaceChildren();
      pageHeader(host, "editing");
      const settings = deps.getSettings();
      const zone = activeZone;
      const zoneSettings = settings[zone];
      const known = FONT_OPTIONS.some((f) => f.value === zoneSettings.font);
      const showCustom = customOpen || !known;

      host.append(
        caption("Text"),
        row(
          "area",
          "Area",
          "Choose which area the font rows below change.",
          segmented<Zone>(
            "Area",
            (Object.keys(ZONE_LABEL) as Zone[]).map((z) => ({ value: z, label: ZONE_LABEL[z] })),
            zone,
            (value) => {
              activeZone = value;
              customOpen = false;
              draw();
            },
          ),
        ),
      );

      const fontSelect = select<string>(
        "Font family",
        [...FONT_OPTIONS.map((f) => ({ value: f.value, label: f.label })), { value: CUSTOM, label: "Custom…" }],
        showCustom ? CUSTOM : zoneSettings.font,
        (value) => {
          if (value === CUSTOM) {
            customOpen = true;
            draw();
            return;
          }
          customOpen = false;
          deps.onSettingsChange(withZone(deps.getSettings(), zone, { font: value }));
          draw();
        },
      );
      host.append(row("font-family", "Font family", null, fontSelect));

      if (showCustom) {
        const input = textInput("Custom font family", known ? "" : zoneSettings.font, "Iosevka Nerd Font Mono");
        const error = document.createElement("p");
        error.className = "st-note st-error";
        error.setAttribute("role", "status");
        const apply = (): void => {
          const value = input.value.trim();
          if (!value) {
            error.textContent = "Enter an installed font family.";
            return;
          }
          error.textContent = "";
          deps.onSettingsChange(withZone(deps.getSettings(), zone, { font: value }));
          customOpen = false;
          draw();
        };
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            apply();
          }
        });
        const customRow = row("font-family", "Custom font", "An installed font family name.", group(input, button("Apply", apply)));
        customRow.removeAttribute("data-setting");
        customRow.append(error);
        host.append(customRow);
      }

      host.append(
        row(
          "font-size",
          "Font size",
          `${ZONE_LABEL[zone]} default is ${defaultZoneSize(zone)} px.`,
          stepper({
            ariaLabel: `${ZONE_LABEL[zone]} font size`,
            value: zoneSettings.size,
            min: SIZE_MIN,
            max: SIZE_MAX,
            unit: "px",
            resetTo: defaultZoneSize(zone),
            onChange: (size) => deps.onSettingsChange(withZone(deps.getSettings(), zone, { size })),
          }),
        ),
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
    }

    draw();
  },
};
