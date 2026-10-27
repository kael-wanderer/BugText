// Shared app-family shell palettes; editor syntax uses BugText tokens.
export const THEME_CATALOG = [
  {
    "id": "dark",
    "label": "Dark (BugText)",
    "mode": "dark",
    "swatch": [
      "#1b1b1f",
      "#2f2f37",
      "#e3e3e8",
      "#6a6a7a"
    ]
  },
  {
    "id": "catppuccin-mocha",
    "label": "Catppuccin Mocha",
    "mode": "dark",
    "swatch": [
      "#1e1e2e",
      "#313244",
      "#cdd6f4",
      "#cba6f7"
    ]
  },
  {
    "id": "everforest-dark",
    "label": "Everforest Dark",
    "mode": "dark",
    "swatch": [
      "#2d353b",
      "#3d484d",
      "#d3c6aa",
      "#a7c080"
    ]
  },
  {
    "id": "nord",
    "label": "Nord",
    "mode": "dark",
    "swatch": [
      "#2e3440",
      "#434c5e",
      "#eceff4",
      "#88c0d0"
    ]
  },
  {
    "id": "dracula",
    "label": "Dracula",
    "mode": "dark",
    "swatch": [
      "#282a36",
      "#44475a",
      "#f8f8f2",
      "#bd93f9"
    ]
  },
  {
    "id": "tokyo-night",
    "label": "Tokyo Night",
    "mode": "dark",
    "swatch": [
      "#1a1b26",
      "#292e42",
      "#c0caf5",
      "#7aa2f7"
    ]
  },
  {
    "id": "solarized-dark",
    "label": "Solarized Dark",
    "mode": "dark",
    "swatch": [
      "#002b36",
      "#0d4452",
      "#93a1a1",
      "#268bd2"
    ]
  },
  {
    "id": "one-dark",
    "label": "One Dark",
    "mode": "dark",
    "swatch": [
      "#282c34",
      "#333842",
      "#abb2bf",
      "#61afef"
    ]
  },
  {
    "id": "monokai",
    "label": "Monokai",
    "mode": "dark",
    "swatch": [
      "#272822",
      "#3e3d32",
      "#f8f8f2",
      "#a6e22e"
    ]
  },
  {
    "id": "gruvbox-dark",
    "label": "Gruvbox Dark",
    "mode": "dark",
    "swatch": [
      "#282828",
      "#3c3836",
      "#ebdbb2",
      "#d79921"
    ]
  },
  {
    "id": "light",
    "label": "Light",
    "mode": "light",
    "swatch": [
      "#f5f5f7",
      "#e8e8ed",
      "#1d1d1f",
      "#3b6ef5"
    ]
  },
  {
    "id": "catppuccin-latte",
    "label": "Catppuccin Latte",
    "mode": "light",
    "swatch": [
      "#eff1f5",
      "#dce0e8",
      "#4c4f69",
      "#8839ef"
    ]
  },
  {
    "id": "rose-pine-dawn",
    "label": "Ros\u00e9 Pine Dawn",
    "mode": "light",
    "swatch": [
      "#faf4ed",
      "#f2e9e1",
      "#575279",
      "#907aa9"
    ]
  },
  {
    "id": "gruvbox-light",
    "label": "Gruvbox Light",
    "mode": "light",
    "swatch": [
      "#fbf1c7",
      "#ebdbb2",
      "#3c3836",
      "#b57614"
    ]
  },
  {
    "id": "solarized-light",
    "label": "Solarized Light",
    "mode": "light",
    "swatch": [
      "#fdf6e3",
      "#e6dfc8",
      "#586e75",
      "#268bd2"
    ]
  },
  {
    "id": "one-light",
    "label": "One Light",
    "mode": "light",
    "swatch": [
      "#fafafa",
      "#e5e5e6",
      "#383a42",
      "#4078f2"
    ]
  },
  {
    "id": "github-light",
    "label": "GitHub Light",
    "mode": "light",
    "swatch": [
      "#ffffff",
      "#eaeef2",
      "#1f2328",
      "#0969da"
    ]
  },
  {
    "id": "tokyo-night-day",
    "label": "Tokyo Night Day",
    "mode": "light",
    "swatch": [
      "#e1e2e7",
      "#c4c8da",
      "#3760bf",
      "#2e7de9"
    ]
  },
  {
    "id": "everforest-light",
    "label": "Everforest Light",
    "mode": "light",
    "swatch": [
      "#fdf6e3",
      "#efebd4",
      "#5c6a72",
      "#8da101"
    ]
  },
  {
    "id": "ayu-light",
    "label": "Ayu Light",
    "mode": "light",
    "swatch": [
      "#fafafa",
      "#e7e8e9",
      "#5c6166",
      "#ff9940"
    ]
  }
] as const;

export type ConcreteThemeName = (typeof THEME_CATALOG)[number]["id"];
export type DarkThemeName = Extract<(typeof THEME_CATALOG)[number], { mode: "dark" }>["id"];
export type LightThemeName = Extract<(typeof THEME_CATALOG)[number], { mode: "light" }>["id"];
export function isLightTheme(id: string): id is LightThemeName {
  return THEME_CATALOG.some((theme) => theme.id === id && theme.mode === "light");
}
