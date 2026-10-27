import { THEME_CATALOG, isLightTheme } from "../theme-catalog";
import { caption, pageHeader, row, segmented, textInput } from "./controls";
import type { SettingsPage } from "./screen";
import { type ThemeName, type Settings } from "../settings";

export const themePage: SettingsPage = {
  id: "theme",
  render(host, deps) {
    host.classList.add("st-theme-page");
    pageHeader(host, "theme");
    const settings = deps.getSettings();
    const mode = settings.theme === "system" ? "system" : isLightTheme(settings.theme) ? "light" : "dark";
    const appearance = segmented("Appearance", [
      { value: "system", label: "System" }, { value: "dark", label: "Dark" }, { value: "light", label: "Light" },
    ], mode, (value) => {
      const current = deps.getSettings();
      deps.onSettingsChange({ ...current, theme: value === "dark" ? current.darkTheme : value === "light" ? current.lightTheme : "system" });
    });
    appearance.dataset.setting = "theme-mode";
    host.append(caption("Appearance"), appearance);

    function themeList(kind: "dark" | "light"): HTMLElement {
      const block = document.createElement("section");
      block.className = "st-theme-block";
      block.dataset.setting = `${kind}-theme`;
      const title = kind === "dark" ? "Dark Theme" : "Light Theme";
      const heading = document.createElement("strong");
      heading.textContent = title;
      const note = document.createElement("p");
      note.className = "st-note";
      note.textContent = `Used when BugText is ${kind}: always in ${kind === "dark" ? "Dark" : "Light"}, and in System while macOS is ${kind}.`;
      const search = textInput(`Search ${title.toLowerCase()}s`, "", "Search themes");
      search.type = "search";
      search.className = "st-text st-theme-search";
      const box = document.createElement("div");
      box.className = "st-theme-box";
      const options = THEME_CATALOG.filter((o) => o.mode === kind);
      const draw = (): void => {
        box.replaceChildren();
        const current = deps.getSettings()[kind === "dark" ? "darkTheme" : "lightTheme"];
        const shown = options.filter((o) => o.label.toLowerCase().includes(search.value.trim().toLowerCase()));
        const header = document.createElement("div");
        header.className = "st-theme-head";
        const selected = document.createElement("span");
        selected.textContent = `Selected: ${options.find((o) => o.id === current)?.label}`;
        const count = document.createElement("span");
        count.textContent = `Showing ${shown.length} of ${options.length}`;
        header.append(selected, count);
        header.setAttribute("aria-live", "polite");
        const list = document.createElement("div");
        list.className = "st-theme-options";
        list.setAttribute("role", "group");
        list.setAttribute("aria-label", title);
        for (const option of shown) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "st-theme-option";
          button.setAttribute("aria-pressed", String(option.id === current));
          const swatch = document.createElement("span");
          swatch.className = "st-theme-swatch";
          swatch.setAttribute("aria-hidden", "true");
          for (const color of option.swatch) {
            const chip = document.createElement("i");
            chip.style.background = color;
            swatch.append(chip);
          }
          const label = document.createElement("span");
          label.textContent = option.label;
          button.append(swatch, label);
          if (option.id === current) {
            const badge = document.createElement("small");
            badge.textContent = "CURRENT";
            button.append(badge);
          }
          button.addEventListener("click", () => {
            const now = deps.getSettings();
            const patch: Partial<Settings> = kind === "dark"
              ? { darkTheme: option.id as Settings["darkTheme"] }
              : { lightTheme: option.id as Settings["lightTheme"] };
            if (now.theme !== "system" && (kind === "light" ? isLightTheme(now.theme) : !isLightTheme(now.theme))) patch.theme = option.id as ThemeName;
            deps.onSettingsChange({ ...now, ...patch });
            draw();
          });
          list.append(button);
        }
        box.append(header, list);
      };
      search.addEventListener("input", draw);
      draw();
      block.append(heading, note, search, box);
      return block;
    }
    const preview = document.createElement("div");
    preview.className = "st-sidebar-preview";
    preview.dataset.look = settings.sidebarLook;
    preview.setAttribute("aria-hidden", "true");
    for (const [className, widths] of [
      ["st-sidebar-preview-side", [70, 85, 60, 75, 50]],
      ["st-sidebar-preview-main", [40, 90, 80, 65]],
    ] as const) {
      const pane = document.createElement("div");
      pane.className = className;
      widths.forEach((width, index) => {
        const line = document.createElement("i");
        line.style.width = `${width}%`;
        if (className.endsWith("side") && index === 1) line.className = "on";
        pane.append(line);
      });
      preview.append(pane);
    }
    host.append(themeList("dark"), themeList("light"), row("sidebar-look", "Left Sidebar Appearance", "The file explorer and the Settings sidebar.", segmented<Settings["sidebarLook"]>("Left Sidebar Appearance", [
      { value: "default", label: "Default" }, { value: "match", label: "Match Panel" }, { value: "tinted", label: "Tinted" },
    ], settings.sidebarLook, (sidebarLook) => {
      deps.onSettingsChange({ ...deps.getSettings(), sidebarLook });
      preview.dataset.look = sidebarLook;
    })), preview);
  },
};
