import { button, caption, group, pageHeader, row, textInput } from "./controls";
import type { SettingsPage } from "./screen";
import { normalizeThemeName, THEME_OPTIONS, type ThemeName } from "../settings";

type Swatch = { side: string; body: string; ink: string };

// Preview colors copied from each theme's --bg-elev / --bg-editor / --accent
// tokens in styles.css and themes.css. They preview other themes, so they
// cannot come from the active theme's variables.
const SWATCHES: Record<Exclude<ThemeName, "system">, Swatch> = {
  light: { side: "#f4f4f6", body: "#ffffff", ink: "#b9762a" },
  dark: { side: "#191c24", body: "#14161d", ink: "#e0a356" },
  "catppuccin-mocha": { side: "#181825", body: "#1e1e2e", ink: "#cba6f7" },
  "everforest-dark": { side: "#343f44", body: "#2d353b", ink: "#e69875" },
  nord: { side: "#3b4252", body: "#2e3440", ink: "#88c0d0" },
};

function bar(width: string, color: string): HTMLElement {
  const i = document.createElement("i");
  i.style.width = width;
  i.style.background = color;
  return i;
}

function pane(swatch: Swatch, kind: "side" | "body"): HTMLElement {
  const node = document.createElement("div");
  node.style.background = kind === "side" ? swatch.side : swatch.body;
  if (kind === "body") {
    node.append(bar("70%", swatch.ink), bar("90%", "#8888"), bar("60%", "#8888"));
  } else {
    node.append(bar("80%", "#8886"), bar("60%", "#8886"), bar("70%", "#8886"));
  }
  return node;
}

function preview(id: ThemeName): HTMLElement {
  const node = document.createElement("div");
  node.className = "st-tprev";
  if (id === "system") {
    // Split card: light on the left half, dark on the right half.
    const light = document.createElement("div");
    light.className = "st-tprev-half";
    light.append(pane(SWATCHES.light, "side"), pane(SWATCHES.light, "body"));
    const dark = document.createElement("div");
    dark.className = "st-tprev-half";
    dark.append(pane(SWATCHES.dark, "side"), pane(SWATCHES.dark, "body"));
    node.classList.add("split");
    node.append(light, dark);
  } else {
    node.append(pane(SWATCHES[id], "side"), pane(SWATCHES[id], "body"));
  }
  return node;
}

export const themePage: SettingsPage = {
  id: "theme",
  render(host, deps) {
    function draw(): void {
      host.replaceChildren();
      pageHeader(host, "theme");
      const current = deps.getSettings().theme;

      const cards = document.createElement("div");
      cards.className = "st-themes";
      cards.dataset.setting = "theme-cards";
      cards.setAttribute("role", "group");
      cards.setAttribute("aria-label", "Theme");
      for (const option of THEME_OPTIONS) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "st-tcard";
        card.setAttribute("aria-pressed", String(option.id === current));
        const name = document.createElement("div");
        name.className = "st-tname";
        const label = document.createElement("span");
        label.textContent = option.label;
        name.append(label);
        if (option.id === current) {
          const check = document.createElement("span");
          check.className = "st-tcheck";
          check.textContent = "✓";
          check.setAttribute("aria-hidden", "true");
          name.append(check);
        }
        card.append(preview(option.id), name);
        card.addEventListener("click", () => {
          if (option.id === deps.getSettings().theme) return;
          deps.onSettingsChange({ ...deps.getSettings(), theme: option.id });
          draw();
        });
        cards.append(card);
      }
      host.append(caption("Color theme"), cards);

      const input = textInput(
        "Custom theme name",
        THEME_OPTIONS.find((o) => o.id === current)?.label ?? "",
        "Everforest Dark",
      );
      const error = document.createElement("p");
      error.className = "st-note st-error";
      error.setAttribute("role", "status");
      const apply = (): void => {
        const theme = normalizeThemeName(input.value.trim());
        if (!theme) {
          error.textContent = "Use one of the installed theme names.";
          return;
        }
        error.textContent = "";
        deps.onSettingsChange({ ...deps.getSettings(), theme });
        draw();
      };
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          apply();
        }
      });
      const customRow = row(
        "custom-theme",
        "Custom theme name",
        "Type an installed theme name.",
        group(input, button("Apply", apply)),
      );
      customRow.append(error);
      host.append(caption("Custom"), customRow);
    }
    draw();
  },
};
