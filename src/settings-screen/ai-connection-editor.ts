import { invoke } from "@tauri-apps/api/core";
import type { AISettings, Connection } from "../ai/aisettings";
import {
  PRESETS,
  QUICK_FILL,
  isLocalUrl,
  validateBaseUrl,
} from "../ai/connections";
import { loadModelsCache } from "../ai/models-cache";
import { button, select, textInput } from "./controls";
function text(tag: string, value: string, cls?: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = value;
  if (cls) node.className = cls;
  return node;
}
function uniqueId(name: string, settings: AISettings): string {
  let stem =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "connection";
  if (stem.startsWith("cli-")) stem = `connection-${stem}`;
  let id = stem,
    suffix = 2;
  while (settings.connections.some((c) => c.id === id))
    id = `${stem}-${suffix++}`;
  return id;
}
export function openConnectionEditor(
  host: HTMLElement,
  existing: Connection | null,
  settings: AISettings,
  onSave: (
    c: Connection,
    key: string | null,
    removeKey: boolean,
  ) => Promise<void>,
): void {
  const panel = document.createElement("section");
  panel.className = "st-connection-editor";
  panel.setAttribute("role", "dialog");
  panel.setAttribute(
    "aria-label",
    existing ? "Edit Connection" : "Add Connection",
  );
  host.replaceChildren(panel);
  let preset =
    PRESETS.find((p) => p.provider === existing?.provider) ?? PRESETS[0];
  let draft: Connection = existing
    ? { ...existing }
    : {
        id: "",
        name: preset.name,
        provider: preset.provider,
        baseUrl: preset.baseUrl,
        auth: preset.auth,
        textModel: preset.textModel,
      };
  let removeKey = false;
  let cached: Record<string, string[]> = {};
  let hasKey = false;
  let busy = false;
  let refreshModels = () => {};
  let refreshKey = () => {};
  function draw(): void {
    panel.replaceChildren();
    panel.append(text("h3", existing ? "Edit Connection" : "Add Connection"));
    const presets = document.createElement("div");
    presets.className = "st-connection-presets";
    for (const p of PRESETS) {
      const pick = button(p.name, () => {
        preset = p;
        draft = {
          ...draft,
          name:
            draft.name ===
            PRESETS.find((old) => old.provider === draft.provider)?.name
              ? p.name
              : draft.name,
          provider: p.provider,
          baseUrl: p.baseUrl,
          auth: p.auth,
          textModel: p.textModel,
        };
        draw();
      });
      pick.setAttribute("aria-pressed", String(p.provider === preset.provider));
      presets.append(pick);
    }
    panel.append(presets);
    const name = textInput("Name", draft.name);
    const address = textInput("Server address", draft.baseUrl);
    address.type = "url";
    address.readOnly = preset.fixed;
    function field(label: string, control: HTMLElement): void {
      const row = document.createElement("label");
      row.className = "st-connection-field";
      row.append(text("span", label), control);
      panel.append(row);
    }
    field("Name", name);
    field("Server address", address);
    const custom = !preset.fixed;
    const quick = document.createElement("div");
    quick.className = "st-quick-fill";
    quick.hidden = !custom;
    quick.append(text("span", "Quick fill"));
    for (const item of QUICK_FILL)
      quick.append(
        button(item.label, () => {
          address.value = item.baseUrl;
          draft.baseUrl = item.baseUrl;
          draft.auth = "none";
          auth.value = "none";
          keyRow.hidden = true;
        }),
      );
    panel.append(quick);
    let model = draft.textModel;
    const modelInput = textInput("Custom text model", model);
    modelInput.hidden = true;
    const choices = Array.from(
      new Set(
        [
          preset.textModel,
          draft.textModel,
          ...(existing ? (cached[existing.id] ?? []) : []),
        ].filter(Boolean),
      ),
    ).map((value) => ({ value, label: value }));
    const models = select(
      "Text model",
      [...choices, { value: "__custom", label: "Custom…" }],
      choices.some((c) => c.value === model) ? model : "__custom",
      (value) => {
        modelInput.hidden = value !== "__custom";
        if (value !== "__custom") {
          model = value;
          draft.textModel = model;
        } else {
          modelInput.value = model;
          modelInput.focus();
        }
      },
    );
    if (models.value === "__custom") modelInput.hidden = false;
    refreshModels = () => {
      const current = models.value;
      const options = Array.from(
        new Set(
          [
            preset.textModel,
            draft.textModel,
            ...(existing ? (cached[existing.id] ?? []) : []),
          ].filter(Boolean),
        ),
      );
      models.replaceChildren();
      for (const value of options) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        models.append(option);
      }
      const custom = document.createElement("option");
      custom.value = "__custom";
      custom.textContent = "Custom…";
      models.append(custom);
      models.value = options.includes(current) ? current : "__custom";
    };
    modelInput.addEventListener("input", () => {
      model = modelInput.value;
      draft.textModel = model;
    });
    field("Text model", models);
    panel.append(modelInput);
    const auth = select(
      "Authentication",
      [
        { value: "none", label: "None" },
        { value: "bearer", label: "Bearer" },
      ],
      draft.auth,
      (value) => {
        draft.auth = value;
        keyRow.hidden = value === "none";
      },
    );
    if (custom) field("Authentication", auth);
    const keyRow = document.createElement("div");
    keyRow.className = "st-connection-field";
    keyRow.hidden = draft.auth === "none";
    const key = textInput("API key", "");
    key.type = "password";
    key.autocomplete = "new-password";
    const keyState = text(
      "span",
      hasKey
        ? removeKey
          ? "API key will be removed"
          : "A key is saved"
        : "No API key saved",
      "st-note",
    );
    const remove = button("Remove API Key", () => {
      removeKey = true;
      key.value = "";
      keyState.textContent = "API key will be removed";
    });
    remove.hidden = !existing;
    refreshKey = () => {
      keyState.textContent = hasKey
        ? removeKey
          ? "API key will be removed"
          : "A key is saved"
        : "No API key saved";
    };
    keyRow.append(text("span", "API key"), key, keyState, remove);
    panel.append(keyRow);
    address.addEventListener("change", () => {
      draft.baseUrl = address.value;
      if (custom && isLocalUrl(address.value)) {
        draft.auth = "none";
        auth.value = "none";
        keyRow.hidden = true;
      }
    });
    name.addEventListener("input", () => {
      draft.name = name.value;
    });
    const error = text("p", "", "st-field-error");
    error.setAttribute("role", "alert");
    const save = button(
      "Save",
      () => {
        if (busy) return;
        if (!existing && settings.connections.length >= 20) {
          error.textContent = "You can add up to 20 connections.";
          return;
        }
        const invalid = validateBaseUrl(address.value.trim());
        if (invalid) {
          error.textContent = invalid;
          return;
        }
        if (!name.value.trim()) {
          error.textContent = "Enter a connection name.";
          return;
        }
        const connection: Connection = {
          id: existing?.id ?? uniqueId(name.value, settings),
          name: name.value.trim(),
          provider: preset.provider,
          baseUrl: address.value.trim(),
          auth: custom ? (auth.value as Connection["auth"]) : preset.auth,
          textModel: model.trim(),
        };
        const secret =
          connection.auth === "bearer" ? key.value.trim() || null : null;
        key.value = "";
        busy = true;
        save.disabled = true;
        void onSave(connection, secret, removeKey || connection.auth === "none")
          .then(() => {
            panel.remove();
          })
          .catch(() => {
            error.textContent = "Could not save the connection. Try again.";
          })
          .finally(() => {
            busy = false;
            save.disabled = false;
          });
      },
      "primary",
    );
    save.disabled = !existing && settings.connections.length >= 20;
    const actions = document.createElement("div");
    actions.className = "st-btns";
    actions.append(
      button("Cancel", () => {
        key.value = "";
        panel.remove();
      }),
      save,
    );
    panel.append(error, actions);
    if (!existing && settings.connections.length >= 20)
      error.textContent = "You can add up to 20 connections.";
  }
  draw();
  void loadModelsCache().then((cache) => {
    cached = cache;
    refreshModels();
  });
  if (existing)
    void invoke<boolean>("has_secret", { id: existing.id })
      .then((value) => {
        hasKey = value;
        refreshKey();
      })
      .catch(() => {});
}
