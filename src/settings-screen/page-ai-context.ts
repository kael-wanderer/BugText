import { button, row, group, stepper } from "./controls";
import type { ScreenDeps } from "./screen";
export function renderContext(host: HTMLElement, deps: Pick<ScreenDeps, "getAISettings" | "getSettings" | "onAISettingsChange" | "onSettingsChange">): void {
  const patterns = document.createElement("div");
  function save(exclude: string[]): void {
    const next = structuredClone(deps.getAISettings()); next.context.exclude = exclude;
    deps.onAISettingsChange(next); draw();
  }
  function draw(): void {
    patterns.replaceChildren();
    const exclude = deps.getAISettings().context.exclude;
    for (const pattern of exclude) {
      const label = document.createElement("code"); label.textContent = pattern;
      patterns.append(group(label, button("Remove", () => save(exclude.filter(p => p !== pattern)))));
    }
    const input = document.createElement("input"); input.className = "st-text"; input.placeholder = "Add pattern…"; input.setAttribute("aria-label", "Add pattern");
    const add = () => { const value = input.value.trim(); if (value && !exclude.includes(value)) save([...exclude, value]); };
    input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } });
    patterns.append(group(input, button("Add", add)));
  }
  draw();
  host.append(row("context-exclude", "Never send to AI", "Patterns relative to the open folder. Not indexed, not offered by @, refused as attachments.", patterns));
  host.append(row("context-files", "Folder search excerpts", "Added to each question while Folder search is on.", stepper({ ariaLabel: "Folder search excerpts", value: deps.getSettings().workspaceContextK, min: 1, max: 20, onChange: workspaceContextK => deps.onSettingsChange({ ...deps.getSettings(), workspaceContextK }) })));
  host.append(row("context-chars", "Maximum context characters", null, stepper({ ariaLabel: "Maximum context characters", value: deps.getAISettings().maxContextChars, min: 4000, max: 2000000, step: 1000, onChange: value => { const next = structuredClone(deps.getAISettings()); next.maxContextChars = value; deps.onAISettingsChange(next); } })));
}
