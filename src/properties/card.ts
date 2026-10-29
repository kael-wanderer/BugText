import { loadProperties, propertiesModule } from "./loader";
import type { PropertyEdit } from "./edit";

type Apply = (source: string, edit: PropertyEdit) => boolean;

export function createPropertiesCard(host: HTMLElement, show: () => string | null, onShowSource: () => void, apply?: Apply) {
  let sourceShown = false;
  let addingProperties = false;
  function render(): void {
    const mod = propertiesModule();
    if (!mod) {
      void loadProperties().then(render);
      return;
    }
    const { propertyKind, readProperties, removeProperty, setProperty } = mod;
    host.replaceChildren();
    const source = show();
    const result = source === null ? null : readProperties(source);
    host.hidden = source === null || (!result && !apply);
    if (host.hidden || source === null) return;
    if (!result && !addingProperties) {
      const add = document.createElement("button"); add.type = "button"; add.textContent = "+ add properties";
      add.addEventListener("click", () => { addingProperties = true; render(); }); host.append(add); return;
    }
    if (sourceShown) {
      const toggle = document.createElement("button"); toggle.type = "button"; toggle.textContent = "Show properties";
      toggle.addEventListener("click", () => { sourceShown = false; render(); }); host.append(toggle); return;
    }
    const header = document.createElement("div"); header.className = "properties-header";
    const title = document.createElement("span"); title.textContent = "Properties";
    const actions = document.createElement("div");
    const sourceButton = document.createElement("button"); sourceButton.type = "button"; sourceButton.textContent = "Show source";
    sourceButton.addEventListener("click", () => { sourceShown = true; render(); onShowSource(); });
    if (result) actions.append(sourceButton);
    header.append(title, actions); host.append(header);
    if (result && !result.ok) {
      const error = document.createElement("div"); error.className = "properties-error";
      error.textContent = `Properties could not be read — line ${result.line}: ${result.error}`;
      host.append(error); return;
    }
    const props = result?.ok ? result.props : {};
    const message = document.createElement("div"); message.className = "properties-error"; message.hidden = true;
    const commit = (edit: PropertyEdit | null): void => {
      if (!edit || !apply || !apply(source, edit)) {
        message.textContent = "Could not edit this property. Check its source and try again.";
        message.hidden = false;
      } else render();
    };
    if (apply) {
      const add = document.createElement("button"); add.type = "button"; add.textContent = "+ add";
      add.addEventListener("click", () => {
        add.hidden = true;
        const input = document.createElement("input"); input.type = "text"; input.placeholder = "Property name"; input.setAttribute("aria-label", "Property name");
        actions.append(input); input.focus();
        input.addEventListener("keydown", (event) => {
          if (event.key === "Escape") { input.remove(); add.hidden = false; }
          if (event.key !== "Enter") return;
          const key = input.value.trim();
          if (Object.prototype.hasOwnProperty.call(props, key)) { message.textContent = "Property already exists"; message.hidden = false; return; }
          commit(setProperty(source, key, ""));
        });
      });
      actions.append(add);
    }
    for (const [key, value] of Object.entries(props)) {
      const row = document.createElement("div"); row.className = "properties-row";
      const label = document.createElement("span"); label.className = "properties-key"; label.textContent = key;
      const output = document.createElement("div"); output.className = "properties-value";
      const isTags = key === "tags" && typeof value === "string";
      const list = Array.isArray(value) ? value : isTags ? value.split(/[\s,]+/).filter(Boolean) : null;
      const kind = list ? "list" : propertyKind(value); row.dataset.kind = kind;
      if (list) {
        for (const [index, item] of list.entries()) {
          const chip = document.createElement("span"); chip.className = "properties-chip";
          const text = document.createElement("span"); text.textContent = String(item); chip.append(text);
          if (apply && list.every(v => typeof v === "string")) {
            const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×"; remove.setAttribute("aria-label", `Remove ${String(item)}`);
            remove.addEventListener("click", () => commit(setProperty(source, key, list.filter((_, i) => i !== index)))); chip.append(remove);
          }
          output.append(chip);
        }
        if (apply && list.every(v => typeof v === "string")) {
          const add = document.createElement("button"); add.type = "button"; add.textContent = "+ add";
          add.addEventListener("click", () => {
            add.hidden = true; const input = document.createElement("input"); input.type = "text"; input.setAttribute("aria-label", `Add ${key}`); output.append(input); input.focus();
            input.addEventListener("keydown", event => {
              if (event.key === "Escape") { input.remove(); add.hidden = false; }
              if (event.key === "Enter" && input.value.trim()) commit(setProperty(source, key, [...list, input.value.trim()]));
            });
          }); output.append(add);
        }
      } else if (apply && (value === null || ["string", "number", "boolean"].includes(typeof value))) {
        const input = document.createElement("input"); input.type = kind === "checkbox" ? "checkbox" : kind === "date" ? "date" : kind === "number" ? "number" : "text";
        input.setAttribute("aria-label", key);
        if (kind === "checkbox") input.checked = value === true;
        else { input.value = value == null ? "" : String(value); input.placeholder = "empty"; }
        input.addEventListener("change", () => {
          if (kind === "number" && (input.value === "" || !Number.isFinite(Number(input.value)))) { message.textContent = "Enter a valid number."; message.hidden = false; return; }
          commit(setProperty(source, key, kind === "checkbox" ? input.checked : kind === "number" ? Number(input.value) : input.value));
        }); output.append(input);
      } else {
        const text = document.createElement("span"); text.textContent = value == null || value === "" ? "empty" : String(value);
        if (value == null || value === "") text.className = "properties-empty"; output.append(text);
      }
      if (apply) {
        const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×"; remove.setAttribute("aria-label", `Remove property ${key}`);
        remove.addEventListener("click", () => commit(removeProperty(source, key))); output.append(remove);
      }
      row.append(label, output); host.append(row);
    }
    host.append(message);
  }
  return { render, reset() { sourceShown = false; addingProperties = false; render(); } };
}
