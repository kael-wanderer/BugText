// AI page ▸ CLI agents: list (Use / Edit inline / Remove) and Add agent form.

import type { CommandProvider } from "../ai/aisettings";
import { uniqueId } from "./ai-helpers";
import { addSection, emptyItem, focusKey, inlineForm, list, listItem, redrawKeepingFocus, tag, updateAI } from "./ai-dom";
import { button } from "./controls";
import type { ScreenDeps } from "./screen";

export type Section = { node: HTMLElement; draw(): void };

function agentFields(provider?: CommandProvider) {
  return [
    { label: "Name", name: "label", value: provider?.label, placeholder: "Claude Code", required: true },
    { label: "Command", name: "run", value: provider?.run, placeholder: "claude -p {prompt}", required: true },
    {
      label: "Bypass command",
      name: "bypass",
      value: provider?.bypassRun,
      placeholder: "Optional command for bypass mode",
    },
  ];
}

/** `onChange` redraws every section that lists providers. */
export function agentsSection(deps: ScreenDeps, onChange: () => void): Section {
  const node = document.createElement("div");

  function draw(): void {
    const settings = deps.getAISettings();
    const agents = settings.providers.filter((p): p is CommandProvider => p.type === "command");
    const box = list("cli-agents");
    for (const agent of agents) {
      const isDefault = settings.defaultProvider === agent.id;
      const buttons: HTMLElement[] = [];
      if (!isDefault) {
        buttons.push(
          focusKey(
            button("Use", () => {
              updateAI(deps, (next) => {
                next.defaultProvider = agent.id;
              });
              onChange();
            }),
            `agent-use:${agent.id}`,
          ),
        );
      }
      const edit = focusKey(button("Edit", () => openEdit()), `agent-edit:${agent.id}`);
      const remove = focusKey(
        button(
          "Remove",
          () => {
            updateAI(deps, (next) => {
              next.providers = next.providers.filter((p) => p.id !== agent.id);
              if (next.defaultProvider === agent.id) next.defaultProvider = next.providers[0]?.id ?? "";
            });
            onChange();
          },
          "danger",
        ),
        `agent-remove:${agent.id}`,
      );
      buttons.push(edit, remove);
      const item = listItem(
        `agent:${agent.id}`,
        agent.label,
        isDefault ? [tag("Default")] : [],
        agent.run.split(/\s+/)[0],
        buttons,
      );

      function openEdit(): void {
        if (item.querySelector(".st-form")) return;
        const form = inlineForm({
          fields: agentFields(agent),
          submitLabel: "Save",
          onSubmit: (data) => {
            if (!data.label || !data.run) return;
            updateAI(deps, (next) => {
              const target = next.providers.find((p) => p.id === agent.id);
              if (target && target.type === "command") {
                target.label = data.label;
                target.run = data.run;
                target.bypassRun = data.bypass || undefined;
              }
            });
            onChange();
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
    if (!agents.length) box.append(emptyItem("No CLI agents configured."));

    const add = addSection("+ Add agent", "agent-add", (close) =>
      inlineForm({
        fields: agentFields(),
        submitLabel: "Add agent",
        onSubmit: (data) => {
          if (!data.label || !data.run) return;
          updateAI(deps, (next) => {
            const id = uniqueId(data.label, next);
            next.providers.push({
              id,
              label: data.label,
              type: "command",
              run: data.run,
              bypassRun: data.bypass || undefined,
            });
            next.defaultProvider = id;
          });
          onChange();
        },
        onCancel: close,
      }),
    );
    node.replaceChildren(box, add);
  }

  draw();
  return { node, draw: () => redrawKeepingFocus(node, draw) };
}
