import { FEATURE_IDS, type FeatureId, type UseRow } from "../ai/aisettings";
import {
  effortLevels,
  engineKey,
  engineOptions,
  modelOptions,
  onEngineChange,
  resolveUse,
  ENGINE_BADGE,
} from "../ai/engines";
import { button, caption, select, stepper, toggle } from "./controls";
import type { AiPageDeps } from "./page-ai";
import type { ScreenDeps } from "./screen";
const LABELS: Record<FeatureId, string> = {
  chat: "Chat",
  proofread: "Proofread",
  rewrite: "Rewrite",
  summarize: "Summarize",
  outline: "Generate outline",
};
function text(tag: string, value: string, cls?: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = value;
  if (cls) node.className = cls;
  return node;
}
export function renderUseFor(
  host: HTMLElement,
  deps: ScreenDeps & AiPageDeps,
): void {
  const page = document.createElement("div");
  page.className = "st-use-for";
  host.append(page);
  function save(feature: FeatureId, update: (row: UseRow) => UseRow): void {
    const next = structuredClone(deps.getAISettings());
    next.uses[feature] = update(resolveUse(next, feature, deps.getClis()));
    deps.onAISettingsChange(next);
  }
  for (const feature of FEATURE_IDS) {
    if (feature === "chat") page.append(caption("Chat"));
    if (feature === "proofread") page.append(caption("Quick actions"));
    const label = LABELS[feature];
    const row = document.createElement("div");
    row.className = "st-use-row";
    row.dataset.setting = `use-${feature}`;
    const enabled = toggle(
      `Enable ${label}`,
      deps.getAISettings().enabled[feature],
      (value) => {
        const next = structuredClone(deps.getAISettings());
        next.enabled[feature] = value;
        deps.onAISettingsChange(next);
      },
    );
    const name = text("div", "", "st-use-name");
    name.append(
      text("strong", label),
      text(
        "small",
        feature === "chat"
          ? "AI panel · search, summarize, write"
          : "⌘K · right-click ▸ AI",
      ),
    );
    row.append(enabled, name);
    page.append(row);
    const controls = document.createElement("div");
    controls.className = "st-use-controls";
    row.append(controls);
    const note = document.createElement("div");
    note.className = "st-use-warning";
    function draw(): void {
      controls.replaceChildren();
      note.replaceChildren();
      const settings = deps.getAISettings();
      const current = resolveUse(settings, feature, deps.getClis());
      const choices = engineOptions(settings, deps.getClis(), current.engine);
      const engineWrap = document.createElement("div");
      engineWrap.className = "st-engine-control";
      const engine = select(
        `${label} engine`,
        choices,
        engineKey(current.engine),
        (value) => {
          const chosen = choices.find((c) => c.value === value);
          if (!chosen) return;
          save(feature, (row) => onEngineChange(row, chosen.engine));
          draw();
        },
      );
      if (current.engine.kind !== "none") {
        const badge =
          ENGINE_BADGE[
            current.engine.kind === "api" ? "api" : current.engine.tool
          ];
        engineWrap.append(
          text("span", badge.letter, `st-engine-badge ${badge.cls}`),
        );
      }
      engineWrap.append(engine);
      const models = modelOptions(
        current.engine,
        settings,
        deps.getClis(),
        deps.getModelsCache(),
        current.model,
      );
      const modelHost = document.createElement("div");
      modelHost.className = "st-model-control";
      const modelButton = button(
        models.find((m) => m.value === current.model)?.label ?? "—",
        () => {
          menu.hidden = !menu.hidden;
          modelButton.setAttribute("aria-expanded", String(!menu.hidden));
          if (!menu.hidden) search.focus();
        },
      );
      modelButton.setAttribute("aria-label", `${label} model`);
      modelButton.setAttribute("aria-haspopup", "listbox");
      modelButton.setAttribute("aria-expanded", "false");
      modelButton.disabled = current.engine.kind === "none";
      const menu = document.createElement("div");
      menu.className = "st-model-menu";
      menu.hidden = true;
      menu.setAttribute("role", "listbox");
      const search = document.createElement("input");
      search.type = "search";
      search.placeholder = "Search models";
      search.setAttribute("aria-label", `Search ${label} models`);
      const list = document.createElement("div");
      function showModels(): void {
        list.replaceChildren();
        for (const option of models.filter((m) =>
          m.label.toLowerCase().includes(search.value.toLowerCase()),
        )) {
          const pick = button(option.label, () => {
            menu.hidden = true;
            modelButton.setAttribute("aria-expanded", "false");
            if (option.value === "__custom") {
              const custom = document.createElement("input");
              custom.className = "st-text";
              custom.value = current.model;
              custom.setAttribute("aria-label", `${label} custom model`);
              custom.addEventListener("change", () => {
                save(feature, (row) => ({ ...row, model: custom.value }));
              });
              modelHost.replaceChildren(custom);
              custom.focus();
            } else {
              save(feature, (row) => ({ ...row, model: option.value }));
              draw();
            }
          });
          pick.setAttribute("role", "option");
          list.append(pick);
        }
      }
      modelHost.addEventListener("focusout", (event) => {
        if (!modelHost.contains(event.relatedTarget as Node | null)) {
          menu.hidden = true;
          modelButton.setAttribute("aria-expanded", "false");
        }
      });
      search.addEventListener("input", showModels);
      menu.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const options = Array.from(list.querySelectorAll("button"));
          const index = options.findIndex(
            (option) => option === document.activeElement,
          );
          const next =
            event.key === "ArrowDown"
              ? index + 1
              : index <= 0
                ? options.length - 1
                : index - 1;
          options[(next + options.length) % options.length]?.focus();
        }
        if (event.key === "Escape") {
          event.stopPropagation();
          menu.hidden = true;
          modelButton.setAttribute("aria-expanded", "false");
          modelButton.focus();
        }
      });
      showModels();
      menu.append(search, list);
      modelHost.append(modelButton, menu);
      const levels = effortLevels(current.engine);
      const effort = select(
        `${label} effort`,
        levels.length
          ? [
              { value: "", label: "Default" },
              ...levels.map((value) => ({ value, label: value })),
            ]
          : [{ value: "", label: "No effort" }],
        current.effort,
        (value) => save(feature, (row) => ({ ...row, effort: value })),
      );
      effort.disabled = levels.length === 0;
      controls.append(engineWrap, modelHost, effort);
      const selected = choices.find(
        (c) => c.value === engineKey(current.engine),
      );
      if (selected?.missing) {
        note.append(
          text(
            "span",
            current.engine.kind === "cli"
              ? "CLI not found. "
              : "Connection deleted",
          ),
        );
        if (current.engine.kind === "cli")
          note.append(
            button("Rescan", () => {
              void deps.rescan().then(draw);
            }),
          );
      }
      if (current.engine.kind === "none") {
        note.append(
          text(
            "span",
            "Choose an engine — add a connection or install a coding CLI",
          ),
          button("API providers", () => deps.openAiPage?.("api")),
          button("Local CLI", () => deps.openAiPage?.("local-cli")),
        );
      }
      if (note.children.length || note.textContent) row.append(note);
      else note.remove();
    }
    draw();
    if (feature === "chat") {
      const context = document.createElement("div");
      context.className = "st-use-context";
      context.append(text("strong", "Context"));
      const chars = document.createElement("div");
      chars.dataset.setting = "context-chars";
      chars.append(
        text("span", "Max context characters"),
        stepper({
          ariaLabel: "Max context characters",
          value: deps.getAISettings().maxContextChars,
          min: 4000,
          max: 2000000,
          step: 1000,
          onChange: (value) => {
            const next = structuredClone(deps.getAISettings());
            next.maxContextChars = value;
            deps.onAISettingsChange(next);
          },
        }),
      );
      const files = document.createElement("div");
      files.dataset.setting = "context-files";
      files.append(
        text("span", "Files per chat"),
        stepper({
          ariaLabel: "Files per chat",
          value: deps.getSettings().workspaceContextK,
          min: 1,
          max: 20,
          onChange: (workspaceContextK) =>
            deps.onSettingsChange({ ...deps.getSettings(), workspaceContextK }),
        }),
      );
      context.append(chars, files);
      page.append(context);
    }
  }
}
