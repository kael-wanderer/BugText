import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { Connection } from "../ai/aisettings";
import {
  listModels,
  statusLine,
  testTextModel,
  type TestResult,
} from "../ai/connections";
import { dropModels, saveModels } from "../ai/models-cache";
import { openConnectionEditor } from "./ai-connection-editor";
import { button } from "./controls";
import type { ScreenDeps } from "./screen";
function text(tag: string, value: string, cls?: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = value;
  if (cls) node.className = cls;
  return node;
}
export function renderApi(host: HTMLElement, deps: ScreenDeps): void {
  const page = document.createElement("div");
  page.className = "st-api-page";
  const editor = document.createElement("div");
  const list = document.createElement("div");
  list.dataset.setting = "api-connections";
  const footer = document.createElement("div");
  footer.dataset.setting = "api-add";
  const error = text("p", "", "st-field-error");
  error.setAttribute("role", "alert");
  const results = new Map<string, TestResult>();
  const keys = new Map<string, boolean>();
  page.append(editor, list, footer, error);
  host.append(page);
  function current(c: Connection): boolean {
    return deps
      .getAISettings()
      .connections.some((now) => now.id === c.id && now.baseUrl === c.baseUrl);
  }
  function updateCache(id: string, models: string[] | null): void {
    const cache = deps.getModelsCache();
    if (models === null) delete cache[id];
    else
      Object.defineProperty(cache, id, {
        value: models,
        enumerable: true,
        writable: true,
        configurable: true,
      });
  }
  function edit(existing: Connection | null): void {
    openConnectionEditor(
      editor,
      existing,
      deps.getAISettings(),
      async (connection, key, removeKey) => {
        const settings = deps.getAISettings();
        if (!existing && settings.connections.length >= 20)
          throw new Error("Connection limit reached");
        if (
          existing &&
          (existing.baseUrl !== connection.baseUrl || removeKey)
        ) {
          await invoke("delete_secret", { id: existing.id });
          keys.set(existing.id, false);
        }
        if (existing && existing.baseUrl !== connection.baseUrl) {
          await dropModels(existing.id);
          updateCache(existing.id, null);
          results.delete(existing.id);
        }
        if (key) {
          await invoke("set_secret", { id: connection.id, secret: key });
          keys.set(connection.id, true);
        }
        const next = structuredClone(deps.getAISettings());
        next.connections = existing
          ? next.connections.map((c) => (c.id === existing.id ? connection : c))
          : [...next.connections, connection];
        deps.onAISettingsChange(next);
        draw();
      },
    );
  }
  function draw(): void {
    list.replaceChildren();
    footer.replaceChildren();
    for (const c of deps.getAISettings().connections) {
      const row = document.createElement("div");
      row.className = "st-api-row";
      const heading = text("strong", c.name);
      let hostLabel: string;
      try {
        hostLabel = new URL(c.baseUrl).host;
      } catch {
        hostLabel = c.baseUrl;
      }
      const state = text(
        "p",
        statusLine(c, keys.get(c.id) ?? false, results.get(c.id) ?? null),
        "st-note",
      );
      const modelResult = text("p", "", "st-note");
      modelResult.setAttribute("role", "status");
      const actions = document.createElement("div");
      actions.className = "st-btns";
      const test = button("Test Connection", () => {
        void testConnection(c, test, state);
      });
      const textTest = button("Test text model", () => {
        textTest.disabled = true;
        void testTextModel(c, c.textModel)
          .then((result) => {
            modelResult.textContent = result.message;
          })
          .finally(() => {
            textTest.disabled = false;
          });
      });
      const remove = button(
        "Delete",
        () => {
          remove.disabled = true;
          void confirm(`Delete connection “${c.name}”?`, {
            title: "Delete Connection",
            kind: "warning",
          })
            .then(async (yes) => {
              if (!yes) return;
              await invoke("delete_secret", { id: c.id });
              const next = structuredClone(deps.getAISettings());
              next.connections = next.connections.filter(
                (item) => item.id !== c.id,
              );
              deps.onAISettingsChange(next);
              results.delete(c.id);
              keys.delete(c.id);
              await dropModels(c.id);
              updateCache(c.id, null);
              draw();
            })
            .catch(() => {
              error.textContent = "Could not delete the connection. Try again.";
            })
            .finally(() => {
              remove.disabled = false;
            });
        },
        "danger",
      );
      actions.append(
        test,
        textTest,
        button("Edit…", () => edit(c)),
        remove,
      );
      row.append(
        heading,
        text("p", `${hostLabel} · Text`, "st-api-host"),
        state,
        modelResult,
        actions,
      );
      list.append(row);
    }
    const add = button("Add Connection…", () => edit(null));
    add.disabled = deps.getAISettings().connections.length >= 20;
    footer.append(
      add,
      text(
        "p",
        "Model tests send one request and may incur provider charges.",
        "st-note",
      ),
    );
    if (add.disabled)
      footer.append(text("p", "You can add up to 20 connections.", "st-note"));
  }
  async function testConnection(
    c: Connection,
    button?: HTMLButtonElement,
    state?: HTMLElement,
  ): Promise<void> {
    if (button) button.disabled = true;
    try {
      const result = await listModels(c);
      if (!current(c)) return;
      results.set(c.id, result);
      if (state)
        state.textContent = statusLine(c, keys.get(c.id) ?? false, result);
      if (result.ok) {
        await saveModels(c.id, result.models);
        if (current(c)) updateCache(c.id, result.models);
      }
    } catch {
      error.textContent = "Could not save the models cache.";
    } finally {
      if (button) button.disabled = false;
    }
  }
  draw();
  for (const c of deps.getAISettings().connections) {
    void invoke<boolean>("has_secret", { id: c.id })
      .then((has) => {
        if (current(c)) {
          keys.set(c.id, has);
          draw();
        }
      })
      .catch(() => {});
    void testConnection(c).then(() => {
      if (current(c)) draw();
    });
  }
}
