import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { AISettings, UseRow } from "./aisettings";
import { streamChat } from "./client";
import {
  buildMessages,
  type AttachedFile,
  type RetrievedChunk,
} from "./conversation";
import { createWorkspaceIndex } from "./workspace-index";
import { showDiff } from "./edit-review";
import type { EditBinding } from "./edit-binding";
import {
  captureFolderState,
  diffFolderState,
  type FolderDiff,
  type FolderState,
} from "./run-summary";
import {
  beforeAgentRun,
  afterAgentRun,
  type GuardDeps,
} from "./agent-run-guard";
import {
  CLI_LABELS,
  engineKey,
  engineOptions,
  modelOptions,
  onEngineChange,
  resolveUse,
  type CliInfo,
} from "./engines";
import { matchAccelerator } from "../keymap";
import { rankItems } from "../fuzzy";
import { hashText } from "../hash";
import { chatContentText, type ChatMessage } from "./providers";
import { contextTrimWarning } from "./context-budget";
import { prepareCliAttachments } from "./attachments";
export type AIPanelDeps = {
  getSettings(): AISettings;
  onSettingsChange(settings: AISettings): void;
  getClis(): CliInfo[];
  getModelsCache(): Record<string, string[]>;
  guard: GuardDeps;
  onNewNote(text: string): void;
  onOpenNote(path: string): void;
  getDoc(): {
    text: string;
    selection: string;
    windowId: string;
    tabId: string;
    from: number;
    to: number;
    path: string | null;
  };
  lookupTabText(windowId: string, tabId: string): string | null;
  applyEditTo(
    windowId: string,
    tabId: string,
    newText: string,
    selection: { text: string; from: number; to: number },
  ): void;
  beforeApply?: (binding: EditBinding) => void | Promise<void>;
  onInsert(text: string): void;
  onOpenChangedFile(dir: string, relativePath: string): void;
  onClose(): void;
  getSendAccelerator(): string;
  getWorkingDir(): string | null;
  getFileList(): { path: string; name: string }[];
  getWorkspaceContext(): { k: number };
  historyKey: string;
  legacyHistoryKey?: string;
};
export type AIPanel = {
  render(): void;
  resize(): void;
  addAttachments(paths: string[]): void;
  appendBubble(role: string, text: string): HTMLElement;
  resetWorkspaceContext(): void;
  updateWorkspaceFile(path: string, text: string): void;
  removeWorkspaceFile(path: string): void;
};
function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text: string, click: () => void, cls = ""): HTMLButtonElement {
  const node = element("button", cls, text);
  node.type = "button";
  node.addEventListener("click", click);
  return node;
}
function loadHistory(key: string, legacy?: string): ChatMessage[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(key) ??
        (legacy ? localStorage.getItem(legacy) : null) ??
        "[]",
    );
    return Array.isArray(value)
      ? value
          .filter(
            (m) =>
              m &&
              ["user", "assistant", "system"].includes(m.role) &&
              typeof m.content === "string",
          )
          .slice(-100)
      : [];
  } catch {
    return [];
  }
}
export function createAIPanel(
  panelElement: HTMLElement,
  deps: AIPanelDeps,
): AIPanel {
  const body = panelElement.querySelector<HTMLElement>(".ai-body")!;
  panelElement
    .querySelector(".ai-close")
    ?.addEventListener("click", deps.onClose);
  // The message/input DOM is created once. Settings refreshes update only the pickers.
  const picker = element("div", "ai-chat-picker");
  const engineSelect = element("select", "ai-engine");
  engineSelect.setAttribute("aria-label", "Chat engine");
  const modelSelect = element("select", "ai-model");
  modelSelect.setAttribute("aria-label", "Chat model");
  const customModel = element("input", "ai-custom-model");
  customModel.type = "text";
  customModel.hidden = true;
  customModel.setAttribute("aria-label", "Custom chat model");
  picker.append(engineSelect, modelSelect, customModel);
  const messagesElement = element("div", "ai-messages");
  messagesElement.setAttribute("aria-live", "polite");
  const inputRow = element("div", "ai-input-row");
  const attachments = element("div", "ai-attachments");
  const inputWrap = element("div", "ai-input-wrap");
  const mention = element("div", "ai-mention");
  mention.hidden = true;
  const input = element("textarea", "ai-input");
  input.rows = 3;
  input.placeholder = "Ask about your notes… (@ to mention a file)";
  input.setAttribute("aria-label", "Chat message");
  inputWrap.append(mention, input);
  const tools = element("div", "ai-compose-tools");
  const attach = button(
    "📎",
    () => {
      void open({ multiple: true })
        .then((paths) => {
          if (paths) addAttachments(Array.isArray(paths) ? paths : [paths]);
        })
        .catch(() => appendBubble("error", "Could not open the file picker."));
    },
    "ai-attach",
  );
  attach.setAttribute("aria-label", "Attach files");
  const sendButton = button(
    "Send",
    () => {
      void send();
    },
    "ai-send",
  );
  tools.append(attach, sendButton);
  inputRow.append(attachments, inputWrap, tools);
  const header = panelElement.querySelector<HTMLElement>(".ai-header");
  if (header) {
    header.append(picker);
    body.replaceChildren(messagesElement, inputRow);
  } else body.replaceChildren(picker, messagesElement, inputRow);
  const history = loadHistory(deps.historyKey, deps.legacyHistoryKey);
  const workspaceIndex = createWorkspaceIndex();
  let referencedFiles: string[] = [];
  let activeRequest: AbortController | null = null;
  function appendBubble(role: string, text: string): HTMLElement {
    const bubble = element("div", `ai-bubble ai-${role}`, text);
    messagesElement.append(bubble);
    messagesElement.scrollTop = messagesElement.scrollHeight;
    return bubble;
  }
  for (const message of history)
    appendBubble(message.role, chatContentText(message.content));
  function saveChatRow(row: UseRow): void {
    const next = structuredClone(deps.getSettings());
    next.uses.chat = row;
    deps.onSettingsChange(next);
    render();
  }
  function render(): void {
    const settings = deps.getSettings();
    const row = resolveUse(settings, "chat", deps.getClis());
    engineSelect.replaceChildren();
    engineSelect.append(newOption("none", "None"));
    const connections = element("optgroup", "");
    connections.label = "Connections";
    connections.setAttribute("label", "Connections");
    const agents = element("optgroup", "");
    agents.label = "Coding agents";
    agents.setAttribute("label", "Coding agents");
    for (const option of engineOptions(settings, deps.getClis(), row.engine)) {
      if (option.engine.kind === "api")
        connections.append(newOption(option.value, option.label));
      if (option.engine.kind === "cli")
        agents.append(newOption(option.value, option.label));
    }
    engineSelect.append(connections, agents);
    engineSelect.value = engineKey(row.engine);
    modelSelect.replaceChildren();
    const models = modelOptions(
      row.engine,
      settings,
      deps.getClis(),
      deps.getModelsCache(),
      row.model,
    );
    for (const option of models)
      modelSelect.append(newOption(option.value, option.label));
    if (!models.length) modelSelect.append(newOption("", "—"));
    modelSelect.value = row.model;
    modelSelect.disabled = row.engine.kind === "none";
    customModel.hidden = true;
    engineSelect.disabled = !!activeRequest;
    modelSelect.disabled ||= !!activeRequest;
  }
  function newOption(value: string, label: string): HTMLOptionElement {
    const option = element("option", "", label);
    option.value = value;
    return option;
  }
  engineSelect.addEventListener("change", () => {
    const settings = deps.getSettings();
    const row = resolveUse(settings, "chat", deps.getClis());
    const chosen = engineOptions(settings, deps.getClis(), row.engine).find(
      (o) => o.value === engineSelect.value,
    );
    if (chosen) saveChatRow(onEngineChange(row, chosen.engine));
  });
  modelSelect.addEventListener("change", () => {
    if (modelSelect.value === "__custom") {
      customModel.value = resolveUse(
        deps.getSettings(),
        "chat",
        deps.getClis(),
      ).model;
      customModel.hidden = false;
      customModel.focus();
      return;
    }
    saveChatRow({
      ...resolveUse(deps.getSettings(), "chat", deps.getClis()),
      model: modelSelect.value,
    });
  });
  customModel.addEventListener("change", () =>
    saveChatRow({
      ...resolveUse(deps.getSettings(), "chat", deps.getClis()),
      model: customModel.value,
    }),
  );
  function renderAttachments(): void {
    attachments.replaceChildren();
    for (const path of referencedFiles) {
      const chip = element("span", "ai-chip");
      const label = element("span", "", basename(path));
      label.title = path;
      chip.append(
        label,
        button("✕", () => {
          referencedFiles = referencedFiles.filter((p) => p !== path);
          renderAttachments();
        }),
      );
      attachments.append(chip);
    }
  }
  function addAttachments(paths: string[]): void {
    for (const path of paths)
      if (!referencedFiles.includes(path)) referencedFiles.push(path);
    renderAttachments();
  }
  // @mention: fuzzy file picker triggered by an @token at the caret.
  let mentionItems: { path: string; name: string }[] = [];
  let mentionIndex = 0;
  let mentionRange: { start: number; end: number } | null = null;

  const hideMention = (): void => {
    mention.hidden = true;
    mentionItems = [];
    mentionRange = null;
  };

  const renderMention = (): void => {
    mention.replaceChildren();
    mentionItems.forEach((item, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = `ai-mention-item${index === mentionIndex ? " active" : ""}`;
      option.textContent = item.name;
      option.title = item.path;
      option.addEventListener("mousedown", (event) => {
        event.preventDefault();
        chooseMention(index);
      });
      mention.appendChild(option);
    });
    mention.hidden = mentionItems.length === 0;
  };

  const chooseMention = (index: number): void => {
    const item = mentionItems[index];
    if (!item || !mentionRange) return;
    const value = input.value;
    input.value =
      value.slice(0, mentionRange.start) + value.slice(mentionRange.end);
    input.selectionStart = input.selectionEnd = mentionRange.start;
    addAttachments([item.path]);
    hideMention();
    input.focus();
  };

  const updateMention = (): void => {
    const caret = input.selectionStart ?? input.value.length;
    const before = input.value.slice(0, caret);
    const match = /(?:^|\s)@([^\s@]*)$/.exec(before);
    if (!match) {
      hideMention();
      return;
    }
    const query = match[1];
    mentionRange = { start: caret - query.length - 1, end: caret };
    const files = deps.getFileList();
    mentionItems = rankItems(query, files, (file) => file.name).slice(0, 8);
    mentionIndex = 0;
    renderMention();
  };

  input.addEventListener("input", updateMention);
  input.addEventListener("blur", () => window.setTimeout(hideMention, 120));

  function replyActions(reply: string, binding: EditBinding): HTMLElement {
    const actions = element("div", "ai-actions");
    const replace = button("Replace selection…", () =>
      showDiff(actions, binding.selection, reply, binding, {
        lookupTabText: deps.lookupTabText,
        applyEditTo: deps.applyEditTo,
        beforeApply: deps.beforeApply,
      }),
    );
    replace.disabled = !binding.selection;
    actions.append(
      button("Copy", () => {
        void navigator.clipboard.writeText(reply);
      }),
      button("Insert at cursor", () => deps.onInsert(reply)),
      replace,
      button("Save as new note", () => deps.onNewNote(reply)),
    );
    return actions;
  }
  function changedCard(folder: string, diff: FolderDiff): void {
    const total =
      diff.added.length + diff.modified.length + diff.deleted.length;
    if (!total) return;
    const card = element("div", "ai-run-summary");
    card.append(
      element(
        "strong",
        "ai-run-summary-title",
        `Changed ${total} file${total === 1 ? "" : "s"}`,
      ),
    );
    for (const [kind, paths] of [
      ["added", diff.added],
      ["modified", diff.modified],
      ["deleted", diff.deleted],
    ] as const)
      for (const path of paths) {
        const file = button(
          `${kind === "added" ? "+" : kind === "deleted" ? "−" : "~"} ${path}`,
          () => deps.onOpenChangedFile(folder, path),
          `ai-run-file ${kind}`,
        );
        file.disabled = kind === "deleted";
        card.append(file);
      }
    messagesElement.append(card);
  }
  async function send(): Promise<void> {
    if (activeRequest) {
      activeRequest.abort();
      return;
    }
    const prompt = input.value.trim();
    if (!prompt) return;
    const settings = deps.getSettings();
    if (!settings.enabled.chat) return;
    const row = resolveUse(settings, "chat", deps.getClis());
    if (row.engine.kind === "none") {
      appendBubble(
        "system",
        "Choose an engine for Chat in Settings ▸ AI ▸ Use for.",
      );
      return;
    }
    const request = new AbortController();
    activeRequest = request;
    sendButton.textContent = "Cancel";
    sendButton.classList.add("cancel");
    render();
    const started = Date.now();
    const doc = deps.getDoc();
    const binding: EditBinding = {
      windowId: doc.windowId,
      tabId: doc.tabId,
      baseHash: hashText(doc.text),
      selection: doc.selection,
      from: doc.from,
      to: doc.to,
    };
    const workingDir = deps.getWorkingDir();
    const isCli = row.engine.kind === "cli";
    const write =
      isCli &&
      row.engine.kind === "cli" &&
      row.engine.tool !== "pi" &&
      workingDir !== null;
    const runDir = write ? workingDir : null;
    let before: FolderState | null = null;
    let reply = "";
    let retrieved: RetrievedChunk[] = [];
    let replyElement: HTMLElement | null = null;
    const attached = [...referencedFiles];
    referencedFiles = [];
    renderAttachments();
    input.value = "";
    appendBubble(
      "user",
      prompt +
        (attached.length ? `\n\n📎 ${attached.map(basename).join(", ")}` : ""),
    );
    try {
      const files: AttachedFile[] = [];
      let cliAttachmentPaths: string[] = [];
      if (!isCli) {
        const skipped: string[] = [];
        for (const path of attached) {
          if (!/\.(md|markdown|txt|text|jsonc?|csv|tsv|ya?ml|toml|ini|cfg|conf|html?|xml|svg|css|scss|jsx?|tsx?|mjs|cjs|py|rb|rs|go|java|c|h|cpp|hpp|cs|sh|bash|zsh|sql|log|env)$/i.test(path)) {
            skipped.push(basename(path));
            continue;
          }
          try {
            files.push({
              kind: "text",
              name: basename(path),
              content: await invoke<string>("read_file", { path }),
            });
          } catch {
            skipped.push(basename(path));
          }
        }
        if (skipped.length)
          appendBubble(
            "system",
            `Skipped unsupported attachment: ${skipped.join(", ")}. API connections accept text files.`,
          );
      }
      if (isCli) {
        const prepared = await prepareCliAttachments(
          attached,
          workingDir,
          (path) => invoke<string>("read_file", { path }),
        );
        files.push(...prepared.files);
        cliAttachmentPaths = prepared.paths;
        for (const name of prepared.skipped)
          appendBubble(
            "system",
            `${name} is outside the folder, so the agent can't open it.`,
          );
      }
      if (workingDir) {
        try {
          retrieved = await workspaceIndex.query(
            workingDir,
            prompt,
            deps.getWorkspaceContext().k,
            doc.path ?? undefined,
          );
        } catch {
          appendBubble("system", "Workspace context unavailable.");
        }
      }
      const built = buildMessages({
        history,
        prompt,
        docText: doc.text,
        selection: "",
        editMode: false,
        files,
        retrieved,
        maxContextChars: settings.maxContextChars,
      });
      if (built.truncatedChars)
        appendBubble("system", contextTrimWarning(built.truncatedChars));
      if (runDir && row.engine.kind === "cli") {
        await beforeAgentRun(runDir, row.engine.tool, deps.guard);
        before = await captureFolderState(runDir);
      }
      if (request.signal.aborted)
        throw new DOMException("AI request cancelled.", "AbortError");
      replyElement = appendBubble("assistant", "");
      await streamChat(
        row,
        settings,
        built.messages,
        (chunk) => {
          reply += chunk;
          if (replyElement) replyElement.textContent = reply;
          messagesElement.scrollTop = messagesElement.scrollHeight;
        },
        {
          folder: isCli ? runDir : workingDir,
          write,
          attachmentPaths: isCli ? cliAttachmentPaths : [],
          signal: request.signal,
        },
      );
    } catch (error) {
      const cancelled =
        error instanceof DOMException && error.name === "AbortError";
      appendBubble(
        cancelled ? "system" : "error",
        cancelled
          ? "Reply cancelled."
          : error instanceof Error
            ? error.message
            : "The AI request failed.",
      );
    } finally {
      if (reply) {
        history.push(
          { role: "user", content: prompt },
          { role: "assistant", content: reply },
        );
        try {
          localStorage.setItem(
            deps.historyKey,
            JSON.stringify(history.slice(-100)),
          );
        } catch {}
        const connection =
          row.engine.kind === "api"
            ? settings.connections.find(
                (c) =>
                  c.id ===
                  (row.engine.kind === "api" ? row.engine.connectionId : ""),
              )
            : null;
        const model =
          row.model ||
          connection?.textModel ||
          (row.engine.kind === "cli"
            ? CLI_LABELS[row.engine.tool]
            : "Default model");
        const sources = [...new Set(retrieved.map((chunk) => chunk.path))];
        const meta = element(
          "div",
          "ai-reply-meta",
          `${workingDir ? `Searched ${deps.getFileList().filter((file) => /\.(md|markdown|txt)$/i.test(file.path)).length} notes · ` : ""}${model} · ${((Date.now() - started) / 1000).toFixed(1)}s`,
        );
        for (const path of sources)
          meta.append(
            button(basename(path), () => deps.onOpenNote(path), "ai-source"),
          );
        messagesElement.append(meta, replyActions(reply, binding));
      } else replyElement?.remove();
      if (isCli && !workingDir)
        messagesElement.append(
          element("p", "ai-note", "Open a folder to let agents write files."),
        );
      if (runDir && before) {
        try {
          const after = await captureFolderState(runDir);
          const diff = diffFolderState(before, after);
          workspaceIndex.reset();
          changedCard(runDir, diff);
          await afterAgentRun(
            [...diff.added, ...diff.modified, ...diff.deleted].map(
              (path) => `${runDir.replace(/\/$/, "")}/${path}`,
            ),
            deps.guard,
          );
        } catch {
          appendBubble(
            "error",
            "Could not refresh files changed by the coding agent.",
          );
        }
      }
      activeRequest = null;
      sendButton.textContent = "Send";
      sendButton.classList.remove("cancel");
      render();
      messagesElement.scrollTop = messagesElement.scrollHeight;
    }
  }
  input.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (!mention.hidden && mentionItems.length) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        mentionIndex =
          (mentionIndex +
            (event.key === "ArrowDown" ? 1 : mentionItems.length - 1)) %
          mentionItems.length;
        renderMention();
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        chooseMention(mentionIndex);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        hideMention();
        return;
      }
    }
    if (matchAccelerator(event, deps.getSendAccelerator())) {
      event.preventDefault();
      void send();
    }
  });
  render();
  return {
    render,
    resize: () => {},
    addAttachments,
    appendBubble,
    resetWorkspaceContext: () => workspaceIndex.reset(),
    updateWorkspaceFile: (path, text) =>
      workspaceIndex.onFileChanged(path, text),
    removeWorkspaceFile: (path) => workspaceIndex.onFileRemoved(path),
  };
}
