// AI page: CLI agents, Models, chat context rows, and the Agent console.
// Sections redraw on their own (keeping focus) instead of the whole page.

import { clampContextChars, CONTEXT_CHARS_MAX, CONTEXT_CHARS_MIN, CONTEXT_K_MAX, CONTEXT_K_MIN } from "./ai-helpers";
import { updateAI } from "./ai-dom";
import { caption, pageHeader, row, select, stepper, toggle } from "./controls";
import { agentsSection } from "./page-ai-agents";
import { consoleSection } from "./page-ai-console";
import { modelsSection } from "./page-ai-models";
import type { ScreenDeps, SettingsPage } from "./screen";

const SAME_AS_DEFAULT = "";

function quickActionsSelect(deps: ScreenDeps): HTMLSelectElement {
  const settings = deps.getAISettings();
  return select<string>(
    "Quick actions model",
    [
      { value: SAME_AS_DEFAULT, label: "Same as default" },
      ...settings.providers.map((p) => ({ value: p.id, label: p.label })),
    ],
    settings.quickActionProvider ?? SAME_AS_DEFAULT,
    (value) =>
      updateAI(deps, (next) => {
        next.quickActionProvider = value || undefined;
      }),
  );
}

function contextCharsInput(deps: ScreenDeps): HTMLInputElement {
  const input = document.createElement("input");
  input.className = "st-text st-number";
  input.type = "number";
  input.min = String(CONTEXT_CHARS_MIN);
  input.max = String(CONTEXT_CHARS_MAX);
  input.step = "1000";
  input.setAttribute("aria-label", "Max context characters");
  input.value = String(deps.getAISettings().maxContextChars);
  input.addEventListener("change", () => {
    const value = clampContextChars(Number(input.value));
    input.value = String(value);
    updateAI(deps, (next) => {
      next.maxContextChars = value;
    });
  });
  return input;
}

export const aiPage: SettingsPage = {
  id: "ai",
  render(host, deps) {
    pageHeader(host, "ai");

    const quickRow = row(
      "quick-actions-model",
      "Quick actions model",
      "Used by Proofread, Rewrite, Summarize, and Generate outline.",
      quickActionsSelect(deps),
    );
    // Provider lists feed the quick-actions select, so they redraw together.
    const providersChanged = (): void => {
      agents.draw();
      models.draw();
      const current = quickRow.querySelector("select");
      const replacement = quickActionsSelect(deps);
      const hadFocus = current !== null && document.activeElement === current;
      current?.replaceWith(replacement);
      if (hadFocus) replacement.focus({ preventScroll: true });
    };
    const agents = agentsSection(deps, providersChanged);
    const models = modelsSection(deps, providersChanged);
    const terminal = consoleSection(deps);

    const settings = deps.getSettings();
    host.append(
      caption("CLI agents"),
      agents.node,
      caption("Models"),
      models.node,
      quickRow,
      row(
        "max-context",
        "Max context characters",
        "About 4 characters per token. The document or selection is kept before attachments.",
        contextCharsInput(deps),
      ),
      row(
        "workspace-context",
        "Workspace context",
        "Add the most relevant files from the open folder to each chat. Also in the AI panel.",
        toggle("Workspace context", settings.workspaceContext, (workspaceContext) =>
          deps.onSettingsChange({ ...deps.getSettings(), workspaceContext }),
        ),
      ),
      row(
        "files-per-chat",
        "Files per chat",
        "How many workspace files a chat may include.",
        stepper({
          ariaLabel: "Files per chat",
          value: settings.workspaceContextK,
          min: CONTEXT_K_MIN,
          max: CONTEXT_K_MAX,
          onChange: (workspaceContextK) => deps.onSettingsChange({ ...deps.getSettings(), workspaceContextK }),
        }),
      ),
      terminal.node,
    );
  },
};
