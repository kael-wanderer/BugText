// AI page ▸ Models: list (Use, Key saved badge, Set key…, Test, Remove) and
// the Add model form (Local / Remote). API keys go straight to the OS keychain
// through set_secret / delete_secret; they are never logged or written to
// agent.json.

import { invoke } from "@tauri-apps/api/core";
import type { HttpProvider } from "../ai/aisettings";
import { testConnection } from "../ai/client";
import { loadSavedKeyIds, markKeySaved } from "../state";
import { isLocalBaseUrl, uniqueId } from "./ai-helpers";
import { addSection, emptyItem, focusKey, inlineForm, list, listItem, redrawKeepingFocus, tag, updateAI } from "./ai-dom";
import { button, segmented } from "./controls";
import type { Section } from "./page-ai-agents";
import type { ScreenDeps } from "./screen";

type Locality = "local" | "remote";

const PLACEHOLDERS: Record<Locality, { label: string; base: string }> = {
  local: { label: "Ollama", base: "http://localhost:11434/v1" },
  remote: { label: "OpenAI", base: "https://api.openai.com/v1" },
};

function saveKey(id: string, secret: string): Promise<void> {
  return invoke<void>("set_secret", { id, secret }).then(() => markKeySaved(id, true));
}

function addModelForm(deps: ScreenDeps, onChange: () => void, close: () => void): HTMLElement {
  const holder = document.createElement("div");
  holder.className = "st-form-wrap";
  const form = inlineForm({
    fields: [
      { label: "Name", name: "label", placeholder: PLACEHOLDERS.local.label, required: true },
      { label: "Base URL", name: "base", placeholder: PLACEHOLDERS.local.base, required: true },
      { label: "Model ID", name: "model", placeholder: "Model name", required: true },
      { label: "API key", name: "key", type: "password", placeholder: "Optional — stored in Keychain" },
    ],
    submitLabel: "Add model",
    onSubmit: (data) => {
      if (!data.label) return;
      const saved = updateAI(deps, (next) => {
        const id = uniqueId(data.label, next);
        next.providers.push({ id, label: data.label, type: "http", baseUrl: data.base, model: data.model });
        next.defaultProvider = id;
      });
      const newId = saved.defaultProvider;
      onChange();
      if (data.key && newId) {
        saveKey(newId, data.key)
          .then(onChange)
          .catch(() => {});
      }
    },
    onCancel: close,
  });
  const locality = segmented<Locality>(
    "Model location",
    [
      { value: "local", label: "Local" },
      { value: "remote", label: "Remote" },
    ],
    "local",
    (value) => {
      form.querySelector<HTMLInputElement>('[name="label"]')!.placeholder = PLACEHOLDERS[value].label;
      form.querySelector<HTMLInputElement>('[name="base"]')!.placeholder = PLACEHOLDERS[value].base;
    },
  );
  form.prepend(locality);
  holder.append(form);
  return holder;
}

function keyForm(model: HttpProvider, item: HTMLElement, setKeyButton: HTMLElement, onChange: () => void): void {
  if (item.querySelector(".st-form")) return;
  const form = inlineForm({
    className: "st-keyform",
    fields: [{ label: "API key", name: "key", type: "password", placeholder: "Paste API key" }],
    submitLabel: "Save",
    onSubmit: (data) => {
      if (!data.key) {
        form.remove();
        setKeyButton.focus({ preventScroll: true });
        return;
      }
      saveKey(model.id, data.key)
        .then(onChange)
        .catch(() => {});
    },
    onCancel: () => {
      form.remove();
      setKeyButton.focus({ preventScroll: true });
    },
  });
  item.append(form);
  form.querySelector("input")?.focus({ preventScroll: true });
}

export function modelsSection(deps: ScreenDeps, onChange: () => void): Section {
  const node = document.createElement("div");

  function draw(): void {
    const settings = deps.getAISettings();
    const models = settings.providers.filter((p): p is HttpProvider => p.type === "http");
    const savedKeys = loadSavedKeyIds();
    const box = list("models");
    for (const model of models) {
      const isDefault = settings.defaultProvider === model.id;
      const tags = [tag(isLocalBaseUrl(model.baseUrl) ? "Local" : "Remote")];
      if (isDefault) tags.unshift(tag("Default"));
      if (savedKeys.has(model.id)) tags.push(tag("Key saved", "ok"));

      const status = document.createElement("p");
      status.className = "st-note st-status";
      status.setAttribute("role", "status");

      const buttons: HTMLElement[] = [];
      if (!isDefault) {
        buttons.push(
          focusKey(
            button("Use", () => {
              updateAI(deps, (next) => {
                next.defaultProvider = model.id;
              });
              onChange();
            }),
            `model-use:${model.id}`,
          ),
        );
      }
      const setKey = focusKey(button("Set key…", () => keyForm(model, item, setKey, onChange)), `model-key:${model.id}`);
      const test = focusKey(
        button("Test", async () => {
          test.disabled = true;
          test.textContent = "Testing…";
          status.textContent = "";
          status.classList.remove("ok", "err");
          const result = await testConnection(model);
          status.textContent = result.detail;
          status.classList.toggle("ok", result.ok);
          status.classList.toggle("err", !result.ok);
          test.textContent = "Test";
          test.disabled = false;
        }),
        `model-test:${model.id}`,
      );
      test.setAttribute("aria-label", `Test connection to ${model.label}`);
      const remove = focusKey(
        button(
          "Remove",
          () => {
            markKeySaved(model.id, false);
            void invoke("delete_secret", { id: model.id }).catch(() => {});
            updateAI(deps, (next) => {
              next.providers = next.providers.filter((p) => p.id !== model.id);
              if (next.defaultProvider === model.id) next.defaultProvider = next.providers[0]?.id ?? "";
            });
            onChange();
          },
          "danger",
        ),
        `model-remove:${model.id}`,
      );
      buttons.push(setKey, test, remove);
      const item = listItem(`model:${model.id}`, model.label, tags, `${model.model} @ ${model.baseUrl}`, buttons);
      item.append(status);
      box.append(item);
    }
    if (!models.length) box.append(emptyItem("No models configured."));

    const add = addSection("+ Add model", "model-add", (close) => addModelForm(deps, onChange, close));
    node.replaceChildren(box, add);
  }

  draw();
  return { node, draw: () => redrawKeepingFocus(node, draw) };
}
