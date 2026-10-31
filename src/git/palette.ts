import type { GitPanelControl } from "./panel";
export function gitPaletteItems(available: boolean, focus: (control: GitPanelControl) => void) {
  if (!available) return [];
  return ([ ["commit", "Commit"], ["pull", "Pull"], ["push", "Push"], ["fetch", "Fetch"], ["log", "Show Log"] ] as const)
    .map(([control, label]) => ({ id: `git.${control}`, label: `Git: ${label}`, kind: "command" as const, run: () => focus(control) }));
}
