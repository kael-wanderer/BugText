import { invoke } from "@tauri-apps/api/core";
import { FEATURE_IDS, type CliTool } from "../ai/aisettings";
import { CLI_LABELS, ENGINE_BADGE, resolveUse } from "../ai/engines";
import { runCli } from "../ai/cli-runner";
import { validateBaseUrl } from "../ai/connections";
import { button, select, textInput } from "./controls";
import type { AiPageDeps } from "./page-ai";
import type { ScreenDeps } from "./screen";
const TOOLS: CliTool[] = ["claude", "codex", "pi"];
const FEATURE_LABELS = {
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
export function renderLocalCli(
  host: HTMLElement,
  deps: ScreenDeps & AiPageDeps,
): void {
  const page = document.createElement("div");
  page.className = "st-cli-page";
  const header = document.createElement("div");
  header.className = "st-cli-header";
  header.dataset.setting = "cli-rescan";
  const cards = document.createElement("div");
  const status = text("p", "", "st-note");
  status.setAttribute("role", "status");
  let scanning = false,
    running = false;
  const testButtons: HTMLButtonElement[] = [];
  const rescan = button("Rescan", () => {
    void scan();
  });
  header.append(text("span", "Changes save as you make them."), rescan);
  page.append(header, status, cards);
  host.append(page);
  function busy(): void {
    rescan.disabled = scanning || running;
    for (const b of testButtons) b.disabled = scanning || running;
  }
  function update(tool: CliTool, field: string, value: string): void {
    const next = structuredClone(deps.getAISettings());
    Object.assign(next.localCli[tool], { [field]: value });
    deps.onAISettingsChange(next);
  }
  async function scan(): Promise<void> {
    if (scanning || running) return;
    scanning = true;
    busy();
    draw();
    try {
      await deps.rescan();
      status.textContent = "";
    } catch {
      status.textContent = "Could not scan local coding tools.";
    } finally {
      scanning = false;
      draw();
      busy();
    }
  }
  function keyControls(tool: "claude" | "codex"): HTMLElement {
    const box = document.createElement("div");
    box.className = "st-cli-key";
    const id = `cli-${tool}`;
    const saved = text("p", "Checking saved key…", "st-note");
    const input = textInput(`${CLI_LABELS[tool]} API key`, "");
    input.type = "password";
    input.autocomplete = "new-password";
    const error = text("p", "", "st-note");
    let revision = 0;
    const replace = button("Replace", () => {
      input.hidden = false;
      input.focus();
    });
    const remove = button("Remove", () => {
      revision++;
      void invoke("delete_secret", { id })
        .then(() => {
          saved.textContent = "No API key saved";
          input.value = "";
          input.hidden = false;
          replace.hidden = true;
          remove.hidden = true;
        })
        .catch(() => {
          error.textContent = "Could not remove the saved key.";
        });
    });
    replace.hidden = true;
    remove.hidden = true;
    void invoke<boolean>("has_secret", { id })
      .then((has) => {
        if (revision !== 0) return;
        saved.textContent = has ? "A key is saved" : "No API key saved";
        input.hidden = has;
        replace.hidden = !has;
        remove.hidden = !has;
      })
      .catch(() => {
        if (revision === 0)
          saved.textContent = "Could not check the saved key.";
      });
    input.addEventListener("blur", () => {
      const secret = input.value;
      if (!secret) return;
      revision++;
      input.value = "";
      input.disabled = true;
      void invoke("set_secret", { id, secret })
        .then(() => {
          saved.textContent = "A key is saved";
          input.hidden = true;
          replace.hidden = false;
          remove.hidden = false;
          error.textContent = "";
        })
        .catch(() => {
          error.textContent = "Could not save the API key.";
        })
        .finally(() => {
          input.disabled = false;
        });
    });
    box.append(text("span", "API key"), saved, replace, remove, input, error);
    return box;
  }
  function draw(): void {
    cards.replaceChildren();
    testButtons.length = 0;
    for (const tool of TOOLS) {
      const label = CLI_LABELS[tool];
      const info = deps.getClis().find((c) => c.tool === tool);
      const settings = deps.getAISettings();
      const local = settings.localCli[tool];
      const card = document.createElement("fieldset");
      card.className = "st-cli-card";
      card.dataset.setting = `cli-${tool}`;
      const legend = document.createElement("legend");
      legend.append(
        text(
          "span",
          ENGINE_BADGE[tool].letter,
          `st-engine-letter ${ENGINE_BADGE[tool].cls}`,
        ),
        text("strong", label),
        text(
          "span",
          scanning
            ? "Looking…"
            : info?.found
              ? info.version
              : "Not found on PATH",
          "st-note",
        ),
      );
      card.append(
        legend,
        text("p", "Reads and writes only the open folder", "st-note"),
      );
      if (tool === "claude" && (info?.accounts.length ?? 0) > 1) {
        card.append(
          text("label", "Account"),
          select(
            `${label} Account`,
            info!.accounts.map((a) => ({ value: a.dir, label: a.label })),
            settings.localCli.claude.configDir || info!.accounts[0].dir,
            (value) => update("claude", "configDir", value),
          ),
        );
      }
      const tags = document.createElement("div");
      tags.className = "st-cli-tags";
      for (const feature of FEATURE_IDS) {
        const row = resolveUse(settings, feature, deps.getClis());
        if (row.engine.kind === "cli" && row.engine.tool === tool)
          tags.append(text("span", FEATURE_LABELS[feature]));
      }
      if (!tags.children.length) tags.append(text("span", "Not used"));
      card.append(tags);
      const details = document.createElement("details");
      details.append(text("summary", "Advanced: proxy & custom paths"));
      const fields: [string, string][] =
        tool === "claude"
          ? [
              ["configDir", "Config directory"],
              ["proxyBaseUrl", "Proxy base URL"],
              ["executablePath", "Executable path"],
            ]
          : tool === "codex"
            ? [
                ["codexHome", "Codex home"],
                ["executablePath", "Executable path"],
                ["proxyBaseUrl", "Proxy base URL"],
              ]
            : [["executablePath", "Executable path"]];
      for (const [field, name] of fields) {
        const line = document.createElement("label");
        line.className = "st-cli-field";
        const current = (local as unknown as Record<string, string>)[field];
        const input = textInput(`${label} ${name}`, current);
        const error = text("span", "", "st-field-error");
        line.append(text("span", name), input, error);
        input.addEventListener("blur", () => {
          const value = input.value.trim();
          if (
            value ===
            (
              deps.getAISettings().localCli[tool] as unknown as Record<
                string,
                string
              >
            )[field]
          )
            return;
          const invalid =
            field === "proxyBaseUrl" && value ? validateBaseUrl(value) : null;
          if (invalid) {
            error.textContent = invalid;
            return;
          }
          error.textContent = "";
          update(tool, field, value);
          if (field === "executablePath") void scan();
        });
        details.append(line);
        if (tool === "claude" && field === "proxyBaseUrl")
          details.append(keyControls(tool));
      }
      if (tool === "codex") details.append(keyControls(tool));
      card.append(details);
      if (info?.found) {
        const result = text("p", "", "st-note");
        result.setAttribute("role", "status");
        const test = button(`Test ${label}`, () => {
          if (scanning || running) return;
          running = true;
          busy();
          result.textContent = "Testing…";
          const settings = deps.getAISettings();
          const row = FEATURE_IDS.map((f) =>
            resolveUse(settings, f, deps.getClis()),
          ).find(
            (row) => row.engine.kind === "cli" && row.engine.tool === tool,
          );
          let output = "";
          void runCli({
            tool,
            model: row?.model ?? "",
            effort: row?.effort ?? "",
            write: false,
            folder: null,
            prompt: "Reply with the single word: ok",
            local: settings.localCli,
            onChunk: (chunk) => {
              output += chunk;
            },
          })
            .then(() => {
              result.textContent = `It answered: ${output.trim()}`;
            })
            .catch((error) => {
              result.textContent =
                error instanceof Error
                  ? error.message
                  : "Could not test the coding tool.";
            })
            .finally(() => {
              running = false;
              busy();
            });
        });
        testButtons.push(test);
        card.append(result, test);
      }
      cards.append(card);
    }
    busy();
  }
  void scan();
}
