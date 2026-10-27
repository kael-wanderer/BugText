// Font choices and the shared font picker used by the settings screen pages.

export const FONT_OPTIONS = [
  { label: "System", value: "" },
  { label: "Inter", value: "Inter" },
  { label: "Georgia", value: "Georgia" },
  { label: "Merriweather", value: "Merriweather" },
  { label: "JetBrains Mono", value: "JetBrains Mono" },
  { label: "Iosevka Nerd Font Mono", value: "Iosevka Nerd Font Mono" },
] as const;

const CUSTOM = "__custom__";
const PREVIEW_TEXT = "The quick brown fox jumps over 0123";

/** A typed font family worth saving, or null. Empty or CSS-breaking text never replaces a setting. */
export function validCustomFont(text: string): string | null {
  const value = text.trim();
  if (!value || value.length > 80) return null;
  return /[;{}<>"\\\u0000-\u001f]/.test(value) ? null : value;
}

function isCurated(value: string): boolean {
  return FONT_OPTIONS.some((option) => option.value === value);
}

/**
 * System, the curated families and Custom…, with a preview. Curated choices
 * apply at once; a custom name applies on Enter or blur, and Escape puts the
 * previous value back.
 */
export function fontPicker(
  ariaLabel: string,
  value: string,
  onChange: (font: string) => void,
): HTMLElement {
  let current = value;
  const node = document.createElement("div");
  node.className = "st-font-picker";
  const select = document.createElement("select");
  select.className = "st-select";
  select.setAttribute("aria-label", ariaLabel);
  for (const option of [...FONT_OPTIONS, { label: "Custom…", value: CUSTOM }]) {
    const item = document.createElement("option");
    item.value = option.value;
    item.textContent = option.label;
    select.append(item);
  }
  const custom = document.createElement("span");
  custom.className = "st-font-custom";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "st-text";
  input.spellcheck = false;
  input.placeholder = "Installed font family";
  input.setAttribute("aria-label", `${ariaLabel}, custom`);
  const hint = document.createElement("span");
  hint.className = "st-unit";
  hint.textContent = "Enter to apply · Esc to cancel";
  custom.append(input, hint);
  const preview = document.createElement("span");
  preview.className = "st-font-preview";
  preview.textContent = PREVIEW_TEXT;

  const show = (): void => {
    const curated = isCurated(current);
    select.value = curated ? current : CUSTOM;
    custom.hidden = curated;
    input.value = curated ? "" : current;
    input.removeAttribute("aria-invalid");
    preview.style.fontFamily = current ? `${JSON.stringify(current)}, system-ui` : "system-ui";
  };
  const apply = (font: string): void => {
    current = font;
    show();
    onChange(font);
  };
  const commit = (): void => {
    const next = validCustomFont(input.value);
    if (!next) {
      input.setAttribute("aria-invalid", "true");
      return;
    }
    if (next !== current) apply(next);
    else show();
  };
  select.addEventListener("change", () => {
    if (select.value === CUSTOM) {
      custom.hidden = false;
      input.focus();
      return;
    }
    apply(select.value);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      show();
      select.focus();
    }
  });
  input.addEventListener("blur", () => {
    // Leaving an empty or unusable custom field keeps the saved font.
    if (validCustomFont(input.value)) commit();
    else show();
  });
  show();
  node.append(select, custom, preview);
  return node;
}
