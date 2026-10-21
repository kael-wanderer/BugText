// AI page ▸ Agent console: terminal app, terminal font + size, and the agent
// commands list (Use / Edit / Remove) with Add command.

import { DEFAULT_AI_SETTINGS, type TerminalApp, type TerminalEntry } from "../ai/aisettings";
import { terminalUniqueId, TERMINAL_SIZE_MAX, TERMINAL_SIZE_MIN } from "./ai-helpers";
import { addSection, emptyItem, focusKey, inlineForm, list, listItem, redrawKeepingFocus, tag, updateAI } from "./ai-dom";
import { button, caption, group, row, select, stepper, textInput } from "./controls";
import { FONT_OPTIONS } from "./fonts";
import type { Section } from "./page-ai-agents";
import type { ScreenDeps } from "./screen";

const CUSTOM = "__custom__";

const TERMINAL_APPS: ReadonlyArray<{ value: TerminalApp; label: string }> = [
  { value: "embedded", label: "Embedded in BugText" },
  { value: "terminal", label: "Apple Terminal" },
  { value: "ghostty", label: "Ghostty" },
  { value: "cmux", label: "cmux" },
];

function appNote(app: TerminalApp): string {
  return app === "embedded"
    ? "Runs inside BugText. Terminal font and size apply to this mode."
    : "Agent Console offers a button that launches the selected command in this terminal app.";
}

function commandFields(entry?: TerminalEntry) {
  return [
    { label: "Name", name: "label", value: entry?.label, placeholder: "Shell", required: true },
    { label: "Command", name: "run", value: entry?.run, placeholder: "zsh", required: true },
  ];
}

export function consoleSection(deps: ScreenDeps): Section {
  const node = document.createElement("div");
  // Custom font field visibility is local; agent.json stays the source of truth.
  let customOpen = false;

  function draw(): void {
    const settings = deps.getAISettings();
    const known = !settings.terminalFont || FONT_OPTIONS.some((f) => f.value === settings.terminalFont);
    const showCustom = customOpen || !known;
    const parts: HTMLElement[] = [caption("Agent console")];

    const appRow = row(
      "terminal",
      "Terminal",
      appNote(settings.terminalApp),
      select<TerminalApp>("Terminal", TERMINAL_APPS, settings.terminalApp, (value) => {
        updateAI(deps, (next) => {
          next.terminalApp = value;
        });
        const note = appRow.querySelector(".st-note");
        if (note) note.textContent = appNote(value);
      }),
    );
    parts.push(appRow);

    const fontOptions = [
      { value: "", label: "Default" },
      ...FONT_OPTIONS.map((f) => ({ value: f.value, label: f.label })),
      { value: CUSTOM, label: "Custom…" },
    ];
    const fontSelect = focusKey(
      select<string>("Terminal font", fontOptions, showCustom ? CUSTOM : settings.terminalFont, (value) => {
        if (value === CUSTOM) {
          customOpen = true;
          redraw();
          return;
        }
        customOpen = false;
        updateAI(deps, (next) => {
          next.terminalFont = value;
        });
        redraw();
      }),
      "terminal-font",
    );
    const sizeStepper = stepper({
      ariaLabel: "Terminal font size",
      value: settings.terminalFontSize,
      min: TERMINAL_SIZE_MIN,
      max: TERMINAL_SIZE_MAX,
      unit: "px",
      resetTo: DEFAULT_AI_SETTINGS.terminalFontSize,
      onChange: (size) =>
        updateAI(deps, (next) => {
          next.terminalFontSize = size;
        }),
    });
    parts.push(row("terminal-font", "Terminal font", "Font and size for the embedded terminal.", group(fontSelect, sizeStepper)));

    if (showCustom) {
      const input = focusKey(
        textInput("Custom terminal font family", known ? "" : settings.terminalFont, "JetBrains Mono"),
        "terminal-font-custom",
      );
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
        customOpen = false;
        updateAI(deps, (next) => {
          next.terminalFont = value;
        });
        redraw();
      };
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          apply();
        }
      });
      const customRow = row("terminal-font", "Custom terminal font", "An installed font family name.", group(input, button("Apply", apply)));
      customRow.removeAttribute("data-setting");
      customRow.append(error);
      parts.push(customRow);
    }

    const box = list("agent-commands");
    for (const entry of settings.terminals) {
      const isDefault = settings.defaultTerminal === entry.id;
      const buttons: HTMLElement[] = [];
      if (!isDefault) {
        buttons.push(
          focusKey(
            button("Use", () => {
              updateAI(deps, (next) => {
                next.defaultTerminal = entry.id;
              });
              redraw();
            }),
            `term-use:${entry.id}`,
          ),
        );
      }
      const edit = focusKey(button("Edit", () => openEdit()), `term-edit:${entry.id}`);
      const remove = focusKey(
        button(
          "Remove",
          () => {
            updateAI(deps, (next) => {
              next.terminals = next.terminals.filter((t) => t.id !== entry.id);
              if (next.defaultTerminal === entry.id) next.defaultTerminal = next.terminals[0]?.id ?? "";
            });
            redraw();
          },
          "danger",
        ),
        `term-remove:${entry.id}`,
      );
      buttons.push(edit, remove);
      const item = listItem(`term:${entry.id}`, entry.label, isDefault ? [tag("Default")] : [], entry.run, buttons);

      function openEdit(): void {
        if (item.querySelector(".st-form")) return;
        const form = inlineForm({
          fields: commandFields(entry),
          submitLabel: "Save",
          onSubmit: (data) => {
            if (!data.label || !data.run) return;
            updateAI(deps, (next) => {
              const target = next.terminals.find((t) => t.id === entry.id);
              if (target) {
                target.label = data.label;
                target.run = data.run;
              }
            });
            redraw();
          },
          onCancel: () => {
            form.remove();
            edit.focus({ preventScroll: true });
          },
        });
        item.append(form);
        form.querySelector("input")?.focus({ preventScroll: true });
      }

      box.append(item);
    }
    if (!settings.terminals.length) box.append(emptyItem("No agent commands configured."));
    parts.push(box);

    parts.push(
      addSection("+ Add command", "term-add", (close) =>
        inlineForm({
          fields: commandFields(),
          submitLabel: "Add command",
          onSubmit: (data) => {
            if (!data.label || !data.run) return;
            updateAI(deps, (next) => {
              const id = terminalUniqueId(data.label, next);
              next.terminals.push({ id, label: data.label, run: data.run });
              next.defaultTerminal = id;
            });
            redraw();
          },
          onCancel: close,
        }),
      ),
    );
    node.replaceChildren(...parts);
  }

  const redraw = (): void => redrawKeepingFocus(node, draw);
  draw();
  return { node, draw: redraw };
}
