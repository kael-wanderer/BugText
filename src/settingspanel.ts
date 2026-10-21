import { invoke } from "@tauri-apps/api/core";
import type { AISettings, Provider } from "./ai/aisettings";
import { testConnection } from "./ai/client";
import {
  normalizeThemeName,
  THEME_OPTIONS,
  type Settings,
  type ZoneSettings,
} from "./settings";
import {
  acceleratorFromEvent,
  conflictingIds,
  formatAccelerator,
  KEYMAP_COMMANDS,
  resolveAccelerator,
} from "./keymap";
import { loadSavedKeyIds, markKeySaved } from "./state";

type SettingsTab = "theme" | "format" | "general" | "agent" | "keys";
type ZoneName = "explorer" | "main" | "sub";
type AgentGroup = "command" | "model" | "terminal";

export type SettingsPanelDeps = {
  getSettings: () => Settings;
  getAISettings: () => AISettings;
  onSettingsChange: (settings: Settings) => void;
  onAISettingsChange: (settings: AISettings) => void;
  onOpenSettingsFile: () => void;
  onOpenAISettingsFile: () => void;
  onCheckForUpdates: () => void;
};

export type SettingsPanel = {
  open: (x: number, y: number) => void;
  openKeys: () => void;
  refresh: () => void;
  close: () => void;
};

const FONT_OPTIONS = [
  { label: "System", value: "" },
  { label: "Inter", value: "Inter" },
  { label: "Georgia", value: "Georgia" },
  { label: "Merriweather", value: "Merriweather" },
  { label: "JetBrains Mono", value: "JetBrains Mono" },
  { label: "Iosevka Nerd Font Mono", value: "Iosevka Nerd Font Mono" },
] as const;
const SIZE_OPTIONS = [12, 14, 16, 18, 20, 24] as const;

function cloneSettings(settings: Settings): Settings {
  return {
    ...settings,
    explorer: { ...settings.explorer },
    main: { ...settings.main },
    sub: { ...settings.sub },
    keymap: { ...settings.keymap },
  };
}

function cloneAISettings(settings: AISettings): AISettings {
  return {
    ...settings,
    providers: settings.providers.map((provider) => ({ ...provider })),
    terminals: settings.terminals.map((terminal) => ({ ...terminal })),
  };
}

function providerGroup(provider: Provider): AgentGroup {
  return provider.type === "command" ? "command" : "model";
}

function uniqueId(label: string, settings: AISettings): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "provider";
  let id = base;
  let suffix = 2;
  while (settings.providers.some((provider) => provider.id === id)) {
    id = `${base}-${suffix++}`;
  }
  return id;
}

function terminalUniqueId(label: string, settings: AISettings): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "terminal";
  let id = `${base}-term`;
  let suffix = 2;
  while (settings.terminals.some((terminal) => terminal.id === id)) {
    id = `${base}-term-${suffix++}`;
  }
  return id;
}

export function createSettingsPanel(deps: SettingsPanelDeps): SettingsPanel {
  const panel = document.createElement("section");
  panel.className = "settings-panel hidden";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Settings");
  document.body.appendChild(panel);

  let activeTab: SettingsTab = "theme";
  let activeZone: ZoneName = "main";
  let activeAgentGroup: AgentGroup = "command";
  let recordingId: string | null = null;

  function updateSettings(
    update: (settings: Settings) => void,
  ): void {
    const settings = cloneSettings(deps.getSettings());
    update(settings);
    deps.onSettingsChange(settings);
    render();
  }

  function updateAI(update: (settings: AISettings) => void): void {
    const settings = cloneAISettings(deps.getAISettings());
    update(settings);
    deps.onAISettingsChange(settings);
    render();
  }

  function zoneSettings(settings: Settings): ZoneSettings {
    return settings[activeZone];
  }

  function renderChoiceList(
    choices: Array<{ label: string; selected: boolean; run: () => void }>,
  ): HTMLElement {
    const list = document.createElement("div");
    list.className = "settings-choice-list";
    for (const choice of choices) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `settings-choice${choice.selected ? " selected" : ""}`;
      button.innerHTML = `<span></span><span class="settings-check">${
        choice.selected ? "✓" : ""
      }</span>`;
      button.firstElementChild!.textContent = choice.label;
      button.addEventListener("click", choice.run);
      list.appendChild(button);
    }
    return list;
  }

  function renderCustomInput(
    label: string,
    value: string,
    placeholder: string,
    submit: (value: string, error: HTMLElement) => boolean,
  ): HTMLElement {
    const form = document.createElement("form");
    form.className = "settings-custom";
    form.innerHTML = `
      <label>${label}</label>
      <div class="settings-input-row">
        <input type="text" value="" placeholder="${placeholder}" />
        <button type="submit">Apply</button>
      </div>
      <div class="settings-error" role="status"></div>`;
    const input = form.querySelector<HTMLInputElement>("input")!;
    const error = form.querySelector<HTMLElement>(".settings-error")!;
    input.value = value;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (submit(input.value.trim(), error)) input.blur();
    });
    return form;
  }

  function renderTheme(content: HTMLElement): void {
    const settings = deps.getSettings();
    content.appendChild(
      renderChoiceList(
        THEME_OPTIONS.map((theme) => ({
          label: theme.label,
          selected: settings.theme === theme.id,
          run: () =>
            updateSettings((next) => {
              next.theme = theme.id;
            }),
        })),
      ),
    );
    content.appendChild(
      renderCustomInput(
        "Custom theme name",
        THEME_OPTIONS.find((option) => option.id === settings.theme)?.label ?? "",
        "Everforest Dark",
        (value, error) => {
          const theme = normalizeThemeName(value);
          if (!theme) {
            error.textContent = "Use one of the installed theme names.";
            return false;
          }
          error.textContent = "";
          updateSettings((next) => {
            next.theme = theme;
          });
          return true;
        },
      ),
    );
  }

  function renderZoneTabs(content: HTMLElement): void {
    const row = document.createElement("div");
    row.className = "settings-segment";
    for (const zone of ["explorer", "main", "sub"] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.classList.toggle("active", activeZone === zone);
      button.textContent =
        zone === "main" ? "Main" : zone === "sub" ? "Sub" : "Explorer";
      button.addEventListener("click", () => {
        activeZone = zone;
        render();
      });
      row.appendChild(button);
    }
    content.appendChild(row);
  }

  function renderSubhead(content: HTMLElement, text: string): void {
    const head = document.createElement("h4");
    head.className = "settings-subhead";
    head.textContent = text;
    content.appendChild(head);
  }

  function renderFontControls(content: HTMLElement): void {
    const settings = deps.getSettings();
    const current = zoneSettings(settings).font;
    content.appendChild(
      renderChoiceList(
        FONT_OPTIONS.map((font) => ({
          label: font.label,
          selected: current === font.value,
          run: () =>
            updateSettings((next) => {
              next[activeZone].font = font.value;
            }),
        })),
      ),
    );
    content.appendChild(
      renderCustomInput(
        "Custom font family",
        current,
        "Iosevka Nerd Font Mono",
        (value, error) => {
          if (!value) {
            error.textContent = "Enter an installed font family.";
            return false;
          }
          error.textContent = "";
          updateSettings((next) => {
            next[activeZone].font = value;
          });
          return true;
        },
      ),
    );
  }

  function renderSizeControls(content: HTMLElement): void {
    const current = zoneSettings(deps.getSettings()).size;
    content.appendChild(
      renderChoiceList(
        SIZE_OPTIONS.map((size) => ({
          label: `${size}px`,
          selected: current === size,
          run: () =>
            updateSettings((next) => {
              next[activeZone].size = size;
            }),
        })),
      ),
    );
    content.appendChild(
      renderCustomInput(
        "Custom size",
        String(current),
        "18",
        (value, error) => {
          const size = Number(value);
          if (!Number.isFinite(size) || size < 10 || size > 28) {
            error.textContent = "Choose a size from 10 to 28.";
            return false;
          }
          error.textContent = "";
          updateSettings((next) => {
            next[activeZone].size = Math.round(size);
          });
          return true;
        },
      ),
    );
  }

  function renderFormat(content: HTMLElement): void {
    renderZoneTabs(content);
    renderSubhead(content, "Font");
    renderFontControls(content);
    renderSubhead(content, "Size");
    renderSizeControls(content);
  }

  function renderGeneral(content: HTMLElement): void {
    const settings = deps.getSettings();
    const session = document.createElement("label");
    session.className = "settings-toggle";
    session.innerHTML = `
      <input type="checkbox" ${settings.restoreSession ? "checked" : ""} />
      <span>
        <strong>Restore last session</strong>
        <small>Reopen the last folder, tabs, and active document.</small>
      </span>`;
    session.querySelector("input")!.addEventListener("change", (event) => {
      updateSettings((next) => {
        next.restoreSession = (event.target as HTMLInputElement).checked;
      });
    });
    content.appendChild(session);

    renderSubhead(content, "Updates");
    const modeDescription = document.createElement("p");
    modeDescription.className = "settings-help";
    modeDescription.textContent =
      settings.updateMode === "auto"
        ? "Checks once per day. BugText always asks before downloading and installing."
        : "Checks only when you use Check for Updates. BugText never installs silently.";
    content.appendChild(
      renderChoiceList([
        {
          label: "Manual",
          selected: settings.updateMode === "manual",
          run: () =>
            updateSettings((next) => {
              next.updateMode = "manual";
            }),
        },
        {
          label: "Automatic",
          selected: settings.updateMode === "auto",
          run: () =>
            updateSettings((next) => {
              next.updateMode = "auto";
            }),
        },
      ]),
    );
    content.appendChild(modeDescription);

    const checkButton = document.createElement("button");
    checkButton.type = "button";
    checkButton.className = "settings-check-update";
    checkButton.textContent = "Check for Updates";
    checkButton.addEventListener("click", deps.onCheckForUpdates);
    content.appendChild(checkButton);
  }

  function renderAgentEditor(content: HTMLElement): void {
    const settings = deps.getAISettings();
    const providers = settings.providers.filter(
      (provider) => providerGroup(provider) === activeAgentGroup,
    );
    const list = document.createElement("div");
    list.className = "agent-list";
    for (const provider of providers) {
      const isDefault = settings.defaultProvider === provider.id;
      const rowEl = document.createElement("div");
      rowEl.className = `agent-row${isDefault ? " selected" : ""}`;

      const info = document.createElement("span");
      info.className = "agent-info";
      info.innerHTML = `<strong></strong><small></small>`;
      info.querySelector("strong")!.textContent = provider.label;
      info.querySelector("small")!.textContent =
        provider.type === "command"
          ? provider.run.split(/\s+/)[0]
          : `${provider.model} @ ${provider.baseUrl}`;

      const actions = document.createElement("span");
      actions.className = "agent-actions";
      const status = document.createElement("span");
      status.className = "provider-status";
      status.setAttribute("role", "status");

      const use = document.createElement("button");
      use.type = "button";
      use.className = "agent-use";
      use.textContent = isDefault ? "Selected" : "Use";
      use.addEventListener("click", () =>
        updateAI((next) => {
          next.defaultProvider = provider.id;
        }),
      );
      actions.appendChild(use);

      if (provider.type === "http") {
        const badge = document.createElement("span");
        badge.className = "agent-key-badge";
        badge.textContent = "Key saved";
        badge.hidden = !loadSavedKeyIds().has(provider.id);
        actions.appendChild(badge);

        const setKey = document.createElement("button");
        setKey.type = "button";
        setKey.className = "agent-setkey";
        setKey.textContent = "Set key…";
        setKey.addEventListener("click", () => {
          if (rowEl.querySelector(".agent-keyform")) return;
          const keyForm = document.createElement("form");
          keyForm.className = "agent-keyform";
          keyForm.innerHTML = `<input type="password" name="key" placeholder="Paste API key" /><button type="submit">Save</button>`;
          keyForm.addEventListener("submit", (event) => {
            event.preventDefault();
            const value = String(
              new FormData(keyForm).get("key") ?? "",
            ).trim();
            if (value) {
              void invoke("set_secret", { id: provider.id, secret: value })
                .then(() => {
                  markKeySaved(provider.id, true);
                  render();
                })
                .catch(() => {});
            } else {
              keyForm.remove();
            }
          });
          rowEl.appendChild(keyForm);
          keyForm.querySelector("input")?.focus();
        });
        actions.appendChild(setKey);

        const test = document.createElement("button");
        test.type = "button";
        test.className = "agent-test";
        test.textContent = "Test connection";
        test.addEventListener("click", async () => {
          test.disabled = true;
          test.textContent = "Testing…";
          status.textContent = "";
          status.classList.remove("ok", "err");
          const result = await testConnection(provider);
          status.textContent = result.detail;
          status.classList.toggle("ok", result.ok);
          status.classList.toggle("err", !result.ok);
          test.textContent = "Test connection";
          test.disabled = false;
        });
        actions.appendChild(test);
      }

      if (provider.type === "command") {
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "agent-edit";
        edit.textContent = "Edit";
        edit.addEventListener("click", () => {
          if (rowEl.querySelector(".agent-editform")) return;
          const editForm = document.createElement("form");
          editForm.className = "agent-editform agent-form";
          editForm.innerHTML = `
            <label>Name<input name="label" required /></label>
            <label>Command<input name="run" placeholder="claude -p {prompt}" required /></label>
            <label>Bypass command<input name="bypass" placeholder="Optional command for bypass mode" /></label>
            <button type="submit">Save</button>`;
          editForm.querySelector<HTMLInputElement>('[name="label"]')!.value =
            provider.label;
          editForm.querySelector<HTMLInputElement>('[name="run"]')!.value =
            provider.run;
          editForm.querySelector<HTMLInputElement>('[name="bypass"]')!.value =
            provider.bypassRun ?? "";
          editForm.addEventListener("submit", (event) => {
            event.preventDefault();
            const data = new FormData(editForm);
            const label = String(data.get("label") ?? "").trim();
            const run = String(data.get("run") ?? "").trim();
            if (!label || !run) return;
            updateAI((next) => {
              const target = next.providers.find(
                (candidate) => candidate.id === provider.id,
              );
              if (target && target.type === "command") {
                target.label = label;
                target.run = run;
                target.bypassRun =
                  String(data.get("bypass") ?? "").trim() || undefined;
              }
            });
          });
          rowEl.appendChild(editForm);
          editForm.querySelector("input")?.focus();
        });
        actions.appendChild(edit);
      }

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "agent-remove";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        if (provider.type === "http") {
          markKeySaved(provider.id, false);
          void invoke("delete_secret", { id: provider.id }).catch(() => {});
        }
        updateAI((next) => {
          next.providers = next.providers.filter(
            (candidate) => candidate.id !== provider.id,
          );
          if (next.defaultProvider === provider.id) {
            next.defaultProvider = next.providers[0]?.id ?? "";
          }
        });
      });
      actions.appendChild(remove);

      rowEl.append(info, actions);
      if (provider.type === "http") rowEl.appendChild(status);
      list.appendChild(rowEl);
    }
    if (!providers.length) {
      const empty = document.createElement("p");
      empty.className = "settings-empty";
      empty.textContent = "No providers configured in this section.";
      list.appendChild(empty);
    }
    content.appendChild(list);

    if (activeAgentGroup === "model") {
      const quickRow = document.createElement("label");
      quickRow.className = "agent-quick-action";
      const quickLabel = document.createElement("span");
      quickLabel.textContent = "Quick actions model";
      const quickSelect = document.createElement("select");
      const sameOption = document.createElement("option");
      sameOption.value = "";
      sameOption.textContent = "Same as default";
      quickSelect.appendChild(sameOption);
      for (const provider of settings.providers) {
        const option = document.createElement("option");
        option.value = provider.id;
        option.textContent = provider.label;
        quickSelect.appendChild(option);
      }
      quickSelect.value = settings.quickActionProvider ?? "";
      quickSelect.addEventListener("change", () => {
        updateAI((next) => {
          next.quickActionProvider = quickSelect.value || undefined;
        });
      });
      quickRow.append(quickLabel, quickSelect);
      content.appendChild(quickRow);

      const contextRow = document.createElement("label");
      contextRow.className = "agent-quick-action";
      const contextLabel = document.createElement("span");
      contextLabel.textContent = "Max context characters";
      const contextInput = document.createElement("input");
      contextInput.type = "number";
      contextInput.min = "4000";
      contextInput.max = "2000000";
      contextInput.step = "1000";
      contextInput.value = String(settings.maxContextChars);
      contextInput.addEventListener("change", () => {
        const value = Number(contextInput.value);
        updateAI((next) => {
          next.maxContextChars = Number.isFinite(value)
            ? Math.min(2_000_000, Math.max(4_000, Math.round(value)))
            : 120_000;
        });
      });
      const contextHelp = document.createElement("small");
      contextHelp.textContent =
        "About 4 characters per token. Document or selection is kept before attachments.";
      contextRow.append(contextLabel, contextInput, contextHelp);
      content.appendChild(contextRow);
    }

    const form = document.createElement("form");
    form.className = "agent-form";
    if (activeAgentGroup === "command") {
      form.innerHTML = `
        <label>Name<input name="label" placeholder="Claude Code" required /></label>
        <label>Command<input name="run" placeholder="claude -p {prompt}" required /></label>
        <label>Bypass command<input name="bypass" placeholder="Optional command for bypass mode" /></label>
        <button type="submit">Add agent</button>`;
    } else {
      form.innerHTML = `
        <div class="agent-locality settings-segment">
          <button type="button" data-loc="local" class="active">Local</button>
          <button type="button" data-loc="remote">Remote</button>
        </div>
        <label>Name<input name="label" placeholder="Ollama" required /></label>
        <label>Base URL<input name="base" placeholder="http://localhost:11434/v1" required /></label>
        <label>Model ID<input name="model" placeholder="Model name" required /></label>
        <label>API key<input name="key" type="password" placeholder="Optional — stored in Keychain" /></label>
        <button type="submit">Add model</button>`;
      const localityButtons = Array.from(
        form.querySelectorAll<HTMLButtonElement>("[data-loc]"),
      );
      for (const button of localityButtons) {
        button.addEventListener("click", () => {
          for (const other of localityButtons) {
            other.classList.toggle("active", other === button);
          }
          const remote = button.dataset.loc === "remote";
          const baseInput =
            form.querySelector<HTMLInputElement>('[name="base"]')!;
          const labelInput =
            form.querySelector<HTMLInputElement>('[name="label"]')!;
          baseInput.placeholder = remote
            ? "https://api.openai.com/v1"
            : "http://localhost:11434/v1";
          labelInput.placeholder = remote ? "OpenAI" : "Ollama";
        });
      }
    }
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const label = String(data.get("label") ?? "").trim();
      if (!label) return;
      if (activeAgentGroup === "command") {
        updateAI((next) => {
          const id = uniqueId(label, next);
          next.providers.push({
            id,
            label,
            type: "command",
            run: String(data.get("run") ?? "").trim(),
            bypassRun:
              String(data.get("bypass") ?? "").trim() || undefined,
          });
          next.defaultProvider = id;
        });
      } else {
        const key = String(data.get("key") ?? "").trim();
        let newId = "";
        updateAI((next) => {
          const id = uniqueId(label, next);
          newId = id;
          next.providers.push({
            id,
            label,
            type: "http",
            baseUrl: String(data.get("base") ?? "").trim(),
            model: String(data.get("model") ?? "").trim(),
          });
          next.defaultProvider = id;
        });
        if (key && newId) {
          void invoke("set_secret", { id: newId, secret: key })
            .then(() => {
              markKeySaved(newId, true);
              render();
            })
            .catch(() => {});
        }
      }
    });
    content.appendChild(form);
  }

  function renderKeys(content: HTMLElement): void {
    const settings = deps.getSettings();

    const help = document.createElement("p");
    help.className = "settings-help";
    help.textContent =
      "Click a shortcut, then press the keys. Backspace unbinds; Esc cancels.";
    content.appendChild(help);

    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "settings-restore";
    restore.textContent = "Restore Defaults";
    restore.addEventListener("click", () => {
      recordingId = null;
      updateSettings((next) => {
        next.keymap = {};
      });
    });
    content.appendChild(restore);

    const conflicts = conflictingIds(settings.keymap);
    if (conflicts.size) {
      const warn = document.createElement("p");
      warn.className = "keymap-warning";
      warn.textContent = "⚠ Some shortcuts are assigned to more than one command.";
      content.appendChild(warn);
    }

    const categories = [...new Set(KEYMAP_COMMANDS.map((c) => c.category))];
    for (const category of categories) {
      renderSubhead(content, category);
      const list = document.createElement("div");
      list.className = "keymap-list";
      for (const command of KEYMAP_COMMANDS.filter(
        (c) => c.category === category,
      )) {
        const accel = resolveAccelerator(command, settings.keymap);
        const row = document.createElement("div");
        row.className = "keymap-row";

        const name = document.createElement("span");
        name.className = "keymap-label";
        name.textContent = command.label;

        const keyBtn = document.createElement("button");
        keyBtn.type = "button";
        keyBtn.className = "keymap-key";
        keyBtn.classList.toggle("recording", recordingId === command.id);
        keyBtn.classList.toggle(
          "conflict",
          conflicts.has(command.id) && recordingId !== command.id,
        );
        if (conflicts.has(command.id)) {
          keyBtn.title = "This shortcut is also used by another command";
        }
        keyBtn.textContent =
          recordingId === command.id ? "Press keys…" : formatAccelerator(accel);
        keyBtn.addEventListener("click", () => {
          recordingId = recordingId === command.id ? null : command.id;
          render();
        });

        const reset = document.createElement("button");
        reset.type = "button";
        reset.className = "keymap-reset";
        reset.textContent = "Reset";
        reset.title = "Reset to default";
        reset.addEventListener("click", () => {
          recordingId = null;
          updateSettings((next) => {
            delete next.keymap[command.id];
          });
        });

        const actions = document.createElement("span");
        actions.className = "keymap-actions";
        actions.append(keyBtn, reset);
        row.append(name, actions);
        list.appendChild(row);
      }
      content.appendChild(list);
    }
  }

  function renderTerminalEditor(content: HTMLElement): void {
    const settings = deps.getAISettings();

    renderSubhead(content, "Terminal app");
    content.appendChild(
      renderChoiceList([
        {
          label: "Embedded in BugText",
          selected: settings.terminalApp === "embedded",
          run: () =>
            updateAI((next) => {
              next.terminalApp = "embedded";
            }),
        },
        {
          label: "Apple Terminal",
          selected: settings.terminalApp === "terminal",
          run: () =>
            updateAI((next) => {
              next.terminalApp = "terminal";
            }),
        },
        {
          label: "Ghostty",
          selected: settings.terminalApp === "ghostty",
          run: () =>
            updateAI((next) => {
              next.terminalApp = "ghostty";
            }),
        },
        {
          label: "cmux",
          selected: settings.terminalApp === "cmux",
          run: () =>
            updateAI((next) => {
              next.terminalApp = "cmux";
            }),
        },
      ]),
    );
    const appHelp = document.createElement("p");
    appHelp.className = "settings-help";
    appHelp.textContent =
      settings.terminalApp === "embedded"
        ? "Runs inside BugText. Font and size settings below apply to this mode."
        : "Agent Console will offer a button that launches the selected command in this terminal app.";
    content.appendChild(appHelp);

    renderSubhead(content, "Font");
    content.appendChild(
      renderChoiceList(
        FONT_OPTIONS.map((font) => ({
          label: font.label,
          selected: settings.terminalFont === font.value,
          run: () =>
            updateAI((next) => {
              next.terminalFont = font.value;
            }),
        })),
      ),
    );
    content.appendChild(
      renderCustomInput(
        "Custom font family",
        settings.terminalFont,
        "JetBrains Mono",
        (value) => {
          updateAI((next) => {
            next.terminalFont = value;
          });
          return true;
        },
      ),
    );

    renderSubhead(content, "Size");
    content.appendChild(
      renderChoiceList(
        SIZE_OPTIONS.map((size) => ({
          label: `${size}px`,
          selected: settings.terminalFontSize === size,
          run: () =>
            updateAI((next) => {
              next.terminalFontSize = size;
            }),
        })),
      ),
    );

    renderSubhead(content, "Agent commands");
    const list = document.createElement("div");
    list.className = "agent-list";
    for (const terminal of settings.terminals) {
      const isDefault = settings.defaultTerminal === terminal.id;
      const rowEl = document.createElement("div");
      rowEl.className = `agent-row${isDefault ? " selected" : ""}`;

      const info = document.createElement("span");
      info.className = "agent-info";
      info.innerHTML = `<strong></strong><small></small>`;
      info.querySelector("strong")!.textContent = terminal.label;
      info.querySelector("small")!.textContent = terminal.run;

      const actions = document.createElement("span");
      actions.className = "agent-actions";

      const use = document.createElement("button");
      use.type = "button";
      use.className = "agent-use";
      use.textContent = isDefault ? "Selected" : "Use";
      use.addEventListener("click", () =>
        updateAI((next) => {
          next.defaultTerminal = terminal.id;
        }),
      );
      actions.appendChild(use);

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "agent-edit";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => {
        if (rowEl.querySelector(".agent-editform")) return;
        const editForm = document.createElement("form");
        editForm.className = "agent-editform agent-form";
        editForm.innerHTML = `
          <label>Name<input name="label" required /></label>
          <label>Command<input name="run" placeholder="zsh" required /></label>
          <button type="submit">Save</button>`;
        editForm.querySelector<HTMLInputElement>('[name="label"]')!.value =
          terminal.label;
        editForm.querySelector<HTMLInputElement>('[name="run"]')!.value =
          terminal.run;
        editForm.addEventListener("submit", (event) => {
          event.preventDefault();
          const data = new FormData(editForm);
          const label = String(data.get("label") ?? "").trim();
          const run = String(data.get("run") ?? "").trim();
          if (!label || !run) return;
          updateAI((next) => {
            const target = next.terminals.find((t) => t.id === terminal.id);
            if (target) {
              target.label = label;
              target.run = run;
            }
          });
        });
        rowEl.appendChild(editForm);
        editForm.querySelector("input")?.focus();
      });
      actions.appendChild(edit);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "agent-remove";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        updateAI((next) => {
          next.terminals = next.terminals.filter((t) => t.id !== terminal.id);
          if (next.defaultTerminal === terminal.id) {
            next.defaultTerminal = next.terminals[0]?.id ?? "";
          }
        });
      });
      actions.appendChild(remove);

      rowEl.append(info, actions);
      list.appendChild(rowEl);
    }
    if (!settings.terminals.length) {
      const empty = document.createElement("p");
      empty.className = "settings-empty";
      empty.textContent = "No agent commands configured.";
      list.appendChild(empty);
    }
    content.appendChild(list);

    const form = document.createElement("form");
    form.className = "agent-form";
    form.innerHTML = `
      <label>Name<input name="label" placeholder="Shell" required /></label>
      <label>Command<input name="run" placeholder="zsh" required /></label>
      <button type="submit">Add command</button>`;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const label = String(data.get("label") ?? "").trim();
      const run = String(data.get("run") ?? "").trim();
      if (!label || !run) return;
      updateAI((next) => {
        const id = terminalUniqueId(label, next);
        next.terminals.push({ id, label, run });
        next.defaultTerminal = id;
      });
    });
    content.appendChild(form);
  }

  function renderAgent(content: HTMLElement): void {
    const groups: Array<[AgentGroup, string]> = [
      ["command", "CLI Agents"],
      ["model", "Models"],
      ["terminal", "Agent Console"],
    ];
    const row = document.createElement("div");
    row.className = "settings-segment agent-segment";
    for (const [id, label] of groups) {
      const button = document.createElement("button");
      button.type = "button";
      button.classList.toggle("active", activeAgentGroup === id);
      button.textContent = label;
      button.addEventListener("click", () => {
        activeAgentGroup = id;
        render();
      });
      row.appendChild(button);
    }
    content.appendChild(row);
    const help = document.createElement("p");
    help.className = "settings-help";
    help.textContent =
      activeAgentGroup === "command"
        ? "Installed agent CLIs (Claude Code, Codex, OpenCode, Pi). The agent chooses its own model and uses its own login."
        : activeAgentGroup === "terminal"
          ? "Interactive commands launched in your selected terminal app. Examples: claude, codex, pi, zsh, or custom aliases such as codex-skip."
          : "OpenAI-compatible endpoints — local servers (Ollama, LM Studio) or hosted APIs. Keys are stored in your macOS Keychain.";
    content.appendChild(help);
    if (activeAgentGroup === "terminal") {
      renderTerminalEditor(content);
      return;
    }
    renderAgentEditor(content);
  }

  function render(): void {
    const tabs: Array<[SettingsTab, string]> = [
      ["theme", "Theme"],
      ["format", "Format"],
      ["general", "General"],
      ["agent", "Agent"],
      ["keys", "Keys"],
    ];
    panel.innerHTML = `
      <header class="settings-header">
        <strong>${
          activeTab === "agent"
            ? "Agents"
            : activeTab === "general"
              ? "General"
              : activeTab === "keys"
                ? "Keyboard Shortcuts"
                : "Appearance"
        }</strong>
        <button class="settings-close" type="button" aria-label="Close settings">×</button>
      </header>
      <nav class="settings-tabs" aria-label="Settings sections"></nav>
      <div class="settings-content"></div>
      <footer class="settings-footer">
        <button type="button" data-raw="settings">Open settings.json</button>
        <button type="button" data-raw="ai">Open agent.json</button>
      </footer>`;
    const nav = panel.querySelector<HTMLElement>(".settings-tabs")!;
    for (const [id, label] of tabs) {
      const button = document.createElement("button");
      button.type = "button";
      button.classList.toggle("active", activeTab === id);
      button.textContent = label;
      button.addEventListener("click", () => {
        activeTab = id;
        render();
      });
      nav.appendChild(button);
    }
    panel
      .querySelector(".settings-close")!
      .addEventListener("click", close);
    panel
      .querySelector('[data-raw="settings"]')!
      .addEventListener("click", () => {
        close();
        deps.onOpenSettingsFile();
      });
    panel
      .querySelector('[data-raw="ai"]')!
      .addEventListener("click", () => {
        close();
        deps.onOpenAISettingsFile();
      });

    const content = panel.querySelector<HTMLElement>(".settings-content")!;
    if (activeTab === "theme") renderTheme(content);
    else if (activeTab === "format") renderFormat(content);
    else if (activeTab === "general") renderGeneral(content);
    else if (activeTab === "keys") renderKeys(content);
    else renderAgent(content);
  }

  function close(): void {
    recordingId = null;
    panel.classList.add("hidden");
  }

  document.addEventListener("mousedown", (event) => {
    if (
      !panel.classList.contains("hidden") &&
      event.target instanceof Node &&
      !panel.contains(event.target) &&
      !document.getElementById("ab-settings")?.contains(event.target)
    ) {
      close();
    }
  });
  // Capture phase so a recording in progress swallows the keystroke before the
  // app's global shortcuts (and the Esc-to-close handler below) can react.
  document.addEventListener(
    "keydown",
    (event) => {
      if (!recordingId) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        recordingId = null;
        render();
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        const id = recordingId;
        recordingId = null;
        updateSettings((next) => {
          next.keymap[id] = "";
        });
        return;
      }
      const accel = acceleratorFromEvent(event);
      if (!accel) return;
      const id = recordingId;
      recordingId = null;
      updateSettings((next) => {
        next.keymap[id] = accel;
      });
    },
    true,
  );
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  function openAt(x: number, y: number): void {
    render();
    panel.classList.remove("hidden");
    const width = 440;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, x));
    panel.style.left = `${left}px`;
    panel.style.bottom = `${Math.max(8, window.innerHeight - y - 36)}px`;
  }

  return {
    open: openAt,
    openKeys: () => {
      activeTab = "keys";
      openAt(window.innerWidth / 2 - 220, window.innerHeight / 2 + 240);
    },
    refresh: () => {
      if (!panel.classList.contains("hidden")) render();
    },
    close,
  };
}
