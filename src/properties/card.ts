import { propertyKind, readProperties } from "./parse";

export function createPropertiesCard(host: HTMLElement, show: () => string | null, onShowSource: () => void) {
  let sourceShown = false;
  function render(): void {
    host.replaceChildren();
    const source = show();
    const result = source === null ? null : readProperties(source);
    host.hidden = sourceShown || result === null;
    if (host.hidden || !result) return;
    const header = document.createElement("div");
    header.className = "properties-header";
    const title = document.createElement("span"); title.textContent = "Properties";
    const button = document.createElement("button"); button.type = "button"; button.textContent = "Show source";
    button.addEventListener("click", () => { sourceShown = true; render(); onShowSource(); });
    header.append(title, button); host.append(header);
    if (!result.ok) {
      const error = document.createElement("div"); error.className = "properties-error";
      error.textContent = `Properties could not be read — line ${result.line}: ${result.error}`;
      host.append(error); return;
    }
    for (const [key, value] of Object.entries(result.props)) {
      const row = document.createElement("div"); row.className = "properties-row";
      const label = document.createElement("span"); label.className = "properties-key"; label.textContent = key;
      const output = document.createElement("div"); output.className = "properties-value";
      const kind = propertyKind(value); row.dataset.kind = kind;
      if (kind === "list") {
        for (const item of value as unknown[]) {
          const chip = document.createElement("span"); chip.className = "properties-chip"; chip.textContent = String(item); output.append(chip);
        }
      } else {
        const text = document.createElement("span");
        text.textContent = value == null || value === "" ? "empty" : String(value);
        if (value == null || value === "") text.className = "properties-empty";
        output.append(text);
      }
      row.append(label, output); host.append(row);
    }
  }
  return { render, reset() { sourceShown = false; render(); } };
}
