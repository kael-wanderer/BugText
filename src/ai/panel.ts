import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { AISettings, PermissionMode, Provider } from "./aisettings";
import { cancelCommandRun, streamChat } from "./client";
import { buildMessages, type AttachedFile } from "./conversation";
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
  attachSummary,
  markStatus,
  startRun,
  type RunRecord,
} from "./run-log";
import { matchAccelerator } from "../keymap";
import { rankItems } from "../fuzzy";
import { hashText } from "../hash";
import { chatContentText, type ChatMessage } from "./providers";
import {
  commandPermissionProfiles,
  resolveCommandPermissionProfile,
} from "./providers";
import { contextTrimWarning } from "./context-budget";

export type AIPanelDeps = {
  getSettings: () => AISettings;
  onSettingsChange: (settings: AISettings) => void;
  getDoc: () => {
    text: string;
    selection: string;
    windowId: string;
    tabId: string;
    from: number;
    to: number;
    path: string | null;
  };
  lookupTabText: (windowId: string, tabId: string) => string | null;
  applyEditTo: (
    windowId: string,
    tabId: string,
    newText: string,
    selection: { text: string; from: number; to: number },
  ) => void;
  confirmPermission: (
    providerLabel: string,
    profileLabel: string,
  ) => Promise<boolean>;
  beforeApply?: (binding: EditBinding) => void | Promise<void>;
  onInsert: (text: string) => void;
  onOpenChangedFile: (dir: string, relativePath: string) => void;
  onClose: () => void;
  getSendAccelerator: () => string;
  getWorkingDir: () => string | null;
  getFileList: () => { path: string; name: string }[];
  getWorkspaceContext: () => { enabled: boolean; k: number };
  onWorkspaceContextChange: (enabled: boolean) => void;
  historyKey: string;
  legacyHistoryKey?: string;
};

export type AIPanel = {
  render: () => void;
  resize: () => void;
  addAttachments: (paths: string[]) => void;
  refreshTheme: () => void;
  /** Re-reads the workspace-context checkbox after settings change elsewhere. */
  syncWorkspaceContext: () => void;
  appendBubble: (role: string, text: string) => HTMLElement;
  resetWorkspaceContext: () => void;
  updateWorkspaceFile: (path: string, text: string) => void;
  removeWorkspaceFile: (path: string) => void;
};

const TEXT_EXTENSIONS = new Set([
  "md", "markdown", "txt", "text", "json", "jsonc", "csv", "tsv", "yaml", "yml",
  "toml", "ini", "cfg", "conf", "html", "htm", "xml", "svg", "css", "scss",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb", "rs", "go", "java", "c",
  "h", "cpp", "hpp", "cs", "sh", "bash", "zsh", "sql", "log", "env",
]);

function fileBasename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function isTextAttachment(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXTENSIONS.has(ext);
}

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

type AITab = "chat" | "runs" | "terminal";

function imageMime(path: string): string | null {
  return IMAGE_MIME[path.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

function bytesToDataUrl(bytes: number[], mime: string): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function renderRunSummary(
  host: HTMLElement,
  diff: FolderDiff,
  onOpen: (rel: string) => void,
): void {
  const total = diff.added.length + diff.modified.length + diff.deleted.length;
  if (total === 0) return;
  const box = document.createElement("div");
  box.className = "ai-run-summary";
  const title = document.createElement("div");
  title.className = "ai-run-summary-title";
  title.textContent = `${total} file${total === 1 ? "" : "s"} changed`;
  box.appendChild(title);
  const groups: [string, string[]][] = [
    ["added", diff.added],
    ["modified", diff.modified],
    ["deleted", diff.deleted],
  ];
  for (const [kind, files] of groups) {
    for (const rel of files) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = `ai-run-file ${kind}`;
      const mark = kind === "added" ? "+" : kind === "deleted" ? "−" : "~";
      row.textContent = `${mark} ${rel}`;
      if (kind === "deleted") row.disabled = true;
      else row.addEventListener("click", () => onOpen(rel));
      box.appendChild(row);
    }
  }
  host.appendChild(box);
  host.scrollTop = host.scrollHeight;
}

function loadHistory(key: string, legacyKey?: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(key) ?? (legacyKey ? localStorage.getItem(legacyKey) : null);
    const value = JSON.parse(raw ?? "[]");
    return Array.isArray(value) ? value.slice(-100) : [];
  } catch {
    return [];
  }
}

function relativeRunTime(startedAt: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function createAIPanel(
  panelElement: HTMLElement,
  deps: AIPanelDeps,
): AIPanel {
  const body = panelElement.querySelector<HTMLElement>(".ai-body")!;
  const tabs = panelElement.querySelectorAll<HTMLElement>(".ai-tab");
  panelElement
    .querySelector<HTMLElement>(".ai-close")!
    .addEventListener("click", deps.onClose);
  const history: ChatMessage[] = loadHistory(deps.historyKey, deps.legacyHistoryKey);
  const saveHistory = (): void => {
    localStorage.setItem(deps.historyKey, JSON.stringify(history.slice(-100)));
  };
  let referencedFiles: string[] = [];
  let refreshAttachments: () => void = () => {};
  const addAttachments = (paths: string[]): void => {
    for (const path of paths) {
      if (!referencedFiles.includes(path)) referencedFiles.push(path);
    }
    refreshAttachments();
  };
  let activeTab: AITab = "chat";
  let editMode = false;
  let sessionPermissionMode: PermissionMode = "ask";
  let renderVersion = 0;
  let runs: RunRecord[] = [];
  let refreshRuns: () => void = () => {};
  let activeRunId: string | null = null;
  let terminalView: {
    resize: () => void;
    destroy: () => void;
    setTheme: () => void;
  } | null = null;
  let activeRequest: AbortController | null = null;
  const workspaceIndex = createWorkspaceIndex();

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      activeTab = tab.dataset.tab as AITab;
      tabs.forEach((candidate) => {
        candidate.classList.toggle("active", candidate === tab);
      });
      render();
    });
  });

  function currentProvider(settings = deps.getSettings()): Provider | undefined {
    return (
      settings.providers.find(
        (provider) => provider.id === settings.defaultProvider,
      ) ?? settings.providers[0]
    );
  }

  function addActions(
    afterElement: HTMLElement,
    reply: string,
    wasEdit: boolean,
    binding: EditBinding,
    oldText: string,
  ): void {
    const row = window.document.createElement("div");
    row.className = "ai-actions";
    const copy = window.document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy";
    copy.addEventListener("click", () => {
      void navigator.clipboard.writeText(reply);
    });
    const insert = window.document.createElement("button");
    insert.type = "button";
    insert.textContent = "Insert at cursor";
    insert.addEventListener("click", () => deps.onInsert(reply));
    row.append(copy, insert);

    if (wasEdit) {
      const apply = window.document.createElement("button");
      apply.type = "button";
      apply.textContent = "Apply (diff)";
      apply.addEventListener("click", () => {
        showDiff(row, oldText, reply, binding, {
          lookupTabText: deps.lookupTabText,
          applyEditTo: deps.applyEditTo,
          beforeApply: deps.beforeApply,
        });
      });
      row.appendChild(apply);
    }
    afterElement.after(row);
  }

  function renderChat(): void {
    terminalView?.destroy();
    terminalView = null;
    body.innerHTML = `
      <div class="ai-messages"></div>
      <div class="ai-input-row">
        <div class="ai-control-row">
          <label>
            <span>Agent</span>
            <select class="ai-provider"></select>
          </label>
          <label>
            <span>Permission</span>
            <select class="ai-permission"></select>
          </label>
          <label class="ai-workspace-toggle">
            <input type="checkbox" class="ai-workspace-context" />
            <span>Workspace context</span>
          </label>
          <button class="ai-attach" type="button" title="Attach files">📎</button>
        </div>
        <label class="ai-edit">
          <input type="checkbox" class="ai-editmode" ${
            editMode ? "checked" : ""
          } />
          Edit mode
        </label>
        <div class="ai-attachments"></div>
        <div class="ai-input-wrap">
          <div class="ai-mention" hidden></div>
          <textarea class="ai-input" rows="3" placeholder="Ask about this document… (@ to mention a file)"></textarea>
        </div>
        <button class="ai-send" type="button">Send</button>
      </div>`;
    const messagesElement =
      body.querySelector<HTMLElement>(".ai-messages")!;
    const settings = deps.getSettings();
    const providerSelect =
      body.querySelector<HTMLSelectElement>(".ai-provider")!;
    for (const provider of settings.providers) {
      const option = document.createElement("option");
      option.value = provider.id;
      option.textContent = provider.label;
      option.selected = provider.id === settings.defaultProvider;
      providerSelect.appendChild(option);
    }
    providerSelect.addEventListener("change", () => {
      deps.onSettingsChange({
        ...deps.getSettings(),
        defaultProvider: providerSelect.value,
      });
      const nextProvider = deps
        .getSettings()
        .providers.find((provider) => provider.id === providerSelect.value);
      renderPermissionOptions(nextProvider);
    });
    const permissionSelect =
      body.querySelector<HTMLSelectElement>(".ai-permission")!;
    const permissionLabel = permissionSelect.closest("label") as HTMLElement;
    const renderPermissionOptions = (provider: Provider | undefined): void => {
      permissionSelect.replaceChildren();
      if (!provider || provider.type !== "command") {
        permissionSelect.disabled = true;
        permissionLabel.hidden = true;
        return;
      }
      permissionSelect.disabled = false;
      permissionLabel.hidden = false;
      const profiles = commandPermissionProfiles(provider);
      for (const profile of profiles) {
        const option = document.createElement("option");
        option.value = profile.id;
        option.textContent = profile.label;
        permissionSelect.appendChild(option);
      }
      if (!profiles.some((profile) => profile.id === sessionPermissionMode)) {
        sessionPermissionMode = profiles[0]?.id ?? "ask";
      }
      permissionSelect.value = sessionPermissionMode;
    };
    renderPermissionOptions(currentProvider(settings));
    permissionSelect.addEventListener("change", () => {
      sessionPermissionMode = permissionSelect.value || "ask";
    });
    const workspaceContext =
      body.querySelector<HTMLInputElement>(".ai-workspace-context")!;
    workspaceContext.checked = deps.getWorkspaceContext().enabled;
    workspaceContext.addEventListener("change", () => {
      deps.onWorkspaceContextChange(workspaceContext.checked);
    });
    body
      .querySelector<HTMLInputElement>(".ai-editmode")!
      .addEventListener("change", (event) => {
        editMode = (event.target as HTMLInputElement).checked;
      });

    const input = body.querySelector<HTMLTextAreaElement>(".ai-input")!;
    const attachments = body.querySelector<HTMLElement>(".ai-attachments")!;
    const mention = body.querySelector<HTMLElement>(".ai-mention")!;

    function renderAttachments(): void {
      attachments.replaceChildren();
      for (const path of referencedFiles) {
        const chip = document.createElement("span");
        chip.className = "ai-chip";
        const name = document.createElement("span");
        name.textContent = fileBasename(path);
        name.title = path;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "✕";
        remove.addEventListener("click", () => {
          referencedFiles = referencedFiles.filter((p) => p !== path);
          renderAttachments();
        });
        chip.append(name, remove);
        attachments.appendChild(chip);
      }
    }
    refreshAttachments = renderAttachments;
    renderAttachments();

    body
      .querySelector<HTMLButtonElement>(".ai-attach")!
      .addEventListener("click", () => {
        void open({ multiple: true }).then((selected) => {
          if (!selected) return;
          addAttachments(Array.isArray(selected) ? selected : [selected]);
        });
      });

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

    const addBubble = (role: string, text: string): HTMLElement => {
      const element = window.document.createElement("div");
      element.className = `ai-bubble ai-${role}`;
      element.textContent = text;
      messagesElement.appendChild(element);
      messagesElement.scrollTop = messagesElement.scrollHeight;
      return element;
    };

    for (const message of history) {
      addBubble(message.role, chatContentText(message.content));
    }

    const sendButton = body.querySelector<HTMLButtonElement>(".ai-send")!;
    const send = async (): Promise<void> => {
      if (activeRequest) {
        activeRequest.abort();
        return;
      }
      const prompt = input.value.trim();
      const currentSettings = deps.getSettings();
      const provider = currentProvider(currentSettings);
      if (!prompt) return;
      if (!provider) {
        addBubble(
          "error",
          "No AI provider configured. Add one in AI Settings.",
        );
        return;
      }
      let runMode = sessionPermissionMode;
      if (provider.type === "command") {
        const profile = resolveCommandPermissionProfile(provider, runMode);
        runMode = profile.id;
        if (
          profile.confirmEachRun &&
          !(await deps.confirmPermission(provider.label, profile.label))
        ) {
          return;
        }
      }

      input.value = "";
      const attached = [...referencedFiles];
      const attachLine = attached.length
        ? `\n\n📎 ${attached.map(fileBasename).join(", ")}`
        : "";
      addBubble("user", prompt + attachLine);

      // CLI agents read files themselves (pass paths + run in the folder);
      // HTTP models can't, so inline text-file contents and skip the rest.
      const files: AttachedFile[] = [];
      let attachmentPaths: string[] = [];
      if (provider.type === "command") {
        attachmentPaths = attached;
      } else if (attached.length) {
        const skipped: string[] = [];
        for (const path of attached) {
          const mime = imageMime(path);
          if (mime) {
            try {
              const bytes = await invoke<number[]>("read_file_bytes", { path });
              files.push({
                kind: "image",
                name: fileBasename(path),
                dataUrl: bytesToDataUrl(bytes, mime),
              });
            } catch {
              skipped.push(fileBasename(path));
            }
            continue;
          }
          if (!isTextAttachment(path)) {
            skipped.push(fileBasename(path));
            continue;
          }
          try {
            const content = await invoke<string>("read_file", { path });
            files.push({
              kind: "text",
              name: fileBasename(path),
              content,
            });
          } catch {
            skipped.push(fileBasename(path));
          }
        }
        if (skipped.length) {
          addBubble(
            "error",
            `Skipped unsupported attachment: ${skipped.join(", ")}. HTTP models accept text and common image formats; CLI agents can read file paths directly.`,
          );
        }
      }
      referencedFiles = [];
      refreshAttachments();

      const document = deps.getDoc();
      let retrieved: { path: string; heading: string; text: string }[] = [];
      const workspace = deps.getWorkspaceContext();
      const workingDir = deps.getWorkingDir();
      if (workspace.enabled && workingDir) {
        try {
          retrieved = await workspaceIndex.query(
            workingDir,
            prompt,
            workspace.k,
            document.path ?? undefined,
          );
          if (retrieved.length) {
            const sources = [
              ...new Set(retrieved.map((chunk) => fileBasename(chunk.path))),
            ];
            addBubble("system", `Workspace context: ${sources.join(", ")}`);
          }
        } catch (error) {
          addBubble(
            "error",
            `Workspace context unavailable: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      const binding: EditBinding = {
        windowId: document.windowId,
        tabId: document.tabId,
        baseHash: hashText(document.text),
        selection: document.selection,
        from: document.from,
        to: document.to,
      };
      const built = buildMessages({
        history,
        prompt,
        docText: document.text,
        selection: document.selection,
        editMode,
        files,
        retrieved,
        maxContextChars: currentSettings.maxContextChars,
      });
      if (built.truncatedChars > 0) {
        addBubble("system", contextTrimWarning(built.truncatedChars));
      }
      // CLI agents run with cwd = the open folder and can write files; snapshot
      // the folder before the run so we can summarize what changed afterward.
      const runDir =
        provider.type === "command" && workingDir ? workingDir : null;
      let beforeState: FolderState | null = null;
      if (runDir) beforeState = await captureFolderState(runDir);

      const replyElement = addBubble("assistant", "");
      let reply = "";
      let commandRunId: string | null = null;
      activeRequest = new AbortController();
      sendButton.textContent = "Cancel";
      sendButton.classList.add("cancel");
      try {
        await streamChat(
          provider,
          built.messages,
          (chunk) => {
            reply += chunk;
            replyElement.textContent = reply;
            messagesElement.scrollTop = messagesElement.scrollHeight;
          },
          runMode,
          {
            cwd: deps.getWorkingDir(),
            attachmentPaths,
            onCommandStart: (requestId) => {
              if (provider.type !== "command") return;
              commandRunId = requestId;
              activeRunId = requestId;
              runs = startRun(runs, {
                id: requestId,
                prompt,
                provider: provider.label,
                cwd: runDir,
              });
              refreshRuns();
            },
            signal: activeRequest.signal,
          },
        );
        if (commandRunId) {
          runs = markStatus(runs, commandRunId, "done");
          refreshRuns();
        }
        history.push(
          { role: "user", content: prompt },
          { role: "assistant", content: reply },
        );
        saveHistory();
        addActions(
          replyElement,
          reply,
          editMode,
          binding,
          document.selection.trim() ? document.selection : document.text,
        );
        if (runDir && beforeState) {
          const after = await captureFolderState(runDir);
          const summary = diffFolderState(beforeState, after);
          if (commandRunId) {
            runs = attachSummary(runs, commandRunId, summary);
            refreshRuns();
          }
          renderRunSummary(
            messagesElement,
            summary,
            (rel) => deps.onOpenChangedFile(runDir, rel),
          );
        }
      } catch (error) {
        if (reply) {
          history.push(
            { role: "user", content: prompt },
            { role: "assistant", content: reply },
          );
          saveHistory();
        } else {
          replyElement.remove();
        }
        const cancelled =
          error instanceof DOMException && error.name === "AbortError";
        if (commandRunId) {
          runs = markStatus(
            runs,
            commandRunId,
            cancelled ? "cancelled" : "failed",
          );
          refreshRuns();
        }
        addBubble(
          cancelled ? "system" : "error",
          cancelled
            ? "Reply cancelled."
            : error instanceof Error
              ? error.message
              : String(error),
        );
      } finally {
        activeRequest = null;
        activeRunId = null;
        sendButton.textContent = "Send";
        sendButton.classList.remove("cancel");
      }
    };

    sendButton.addEventListener("click", () => void send());
    input.addEventListener("keydown", (event) => {
      // Don't send while an IME composition is active (e.g. Enter to confirm).
      if (event.isComposing) return;
      if (!mention.hidden && mentionItems.length) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          mentionIndex = (mentionIndex + 1) % mentionItems.length;
          renderMention();
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          mentionIndex =
            (mentionIndex - 1 + mentionItems.length) % mentionItems.length;
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
  }

  function renderRuns(): void {
    terminalView?.destroy();
    terminalView = null;
    body.innerHTML = '<div class="ai-runs"></div>';
    const host = body.querySelector<HTMLElement>(".ai-runs")!;
    refreshRuns = () => {
      host.replaceChildren();
      if (!runs.length) {
        const empty = document.createElement("div");
        empty.className = "ai-runs-empty";
        empty.textContent = "No CLI agent runs yet.";
        host.appendChild(empty);
        return;
      }
      for (const run of runs) {
        const item = document.createElement("div");
        item.className = `ai-run-record ${run.status}`;
        const header = document.createElement("div");
        header.className = "ai-run-record-header";
        const title = document.createElement("div");
        title.className = "ai-run-record-title";
        title.textContent =
          run.prompt.length > 90
            ? `${run.prompt.slice(0, 87).trimEnd()}...`
            : run.prompt;
        title.title = run.prompt;
        const badge = document.createElement("span");
        badge.className = `ai-run-status ${run.status}`;
        badge.textContent = run.status;
        header.append(title, badge);
        const meta = document.createElement("div");
        meta.className = "ai-run-record-meta";
        meta.textContent = `${run.provider} · ${relativeRunTime(run.startedAt)}`;
        item.append(header, meta);
        if (run.status === "running") {
          const cancel = document.createElement("button");
          cancel.type = "button";
          cancel.className = "ai-run-cancel";
          cancel.textContent = "Cancel";
          cancel.addEventListener("click", () => {
            if (activeRunId === run.id) activeRequest?.abort();
            else void cancelCommandRun(run.id);
            runs = markStatus(runs, run.id, "cancelled");
            refreshRuns();
          });
          item.appendChild(cancel);
        }
        if (run.cwd && run.changedFiles) {
          renderRunSummary(item, run.changedFiles, (rel) =>
            deps.onOpenChangedFile(run.cwd!, rel),
          );
        }
        host.appendChild(item);
      }
    };
    refreshRuns();
  }

  async function renderTerminal(version: number): Promise<void> {
    terminalView?.destroy();
    terminalView = null;
    const settings = deps.getSettings();
    const entry =
      settings.terminals.find(
        (terminal) => terminal.id === settings.defaultTerminal,
      ) ?? settings.terminals[0];
    body.innerHTML = `
      <div class="ai-control-row ai-terminal-bar">
        <label>
          <span>Agent command</span>
          <select class="ai-terminal-select"></select>
        </label>
        <label>
          <span>Terminal app</span>
          <select class="ai-terminal-app">
            <option value="embedded">Embedded</option>
            <option value="terminal">Apple Terminal</option>
            <option value="ghostty">Ghostty</option>
            <option value="cmux">cmux</option>
          </select>
        </label>
        <button type="button" class="ai-terminal-restart" hidden>Restart</button>
      </div>
      <div class="ai-terminal-host"></div>`;
    const select = body.querySelector<HTMLSelectElement>(".ai-terminal-select")!;
    for (const terminal of settings.terminals) {
      const option = document.createElement("option");
      option.value = terminal.id;
      option.textContent = terminal.label;
      option.selected = terminal.id === (entry?.id ?? "");
      select.appendChild(option);
    }
    select.addEventListener("change", () => {
      deps.onSettingsChange({
        ...deps.getSettings(),
        defaultTerminal: select.value,
      });
      render();
    });
    const appSelect =
      body.querySelector<HTMLSelectElement>(".ai-terminal-app")!;
    appSelect.value = settings.terminalApp;
    appSelect.addEventListener("change", () => {
      deps.onSettingsChange({
        ...deps.getSettings(),
        terminalApp: appSelect.value as AISettings["terminalApp"],
      });
      render();
    });
    const host = body.querySelector<HTMLElement>(".ai-terminal-host")!;
    const restart =
      body.querySelector<HTMLButtonElement>(".ai-terminal-restart")!;
    restart.addEventListener("click", () => render());
    if (entry && settings.terminalApp !== "embedded") {
      host.classList.add("ai-terminal-external");
      const title = document.createElement("strong");
      title.textContent = `${entry.label} in ${
        settings.terminalApp === "terminal"
          ? "Apple Terminal"
          : settings.terminalApp === "ghostty"
            ? "Ghostty"
            : "cmux"
      }`;
      const detail = document.createElement("p");
      detail.textContent =
        "This command runs in a separate native terminal window using that terminal app's renderer.";
      const launch = document.createElement("button");
      launch.type = "button";
      launch.textContent = "Open terminal";
      launch.addEventListener("click", () => {
        launch.disabled = true;
        void invoke("launch_external_terminal", {
          appName: settings.terminalApp,
          command: entry.run,
          cwd: deps.getWorkingDir(),
        })
          .catch((error) => {
            const message = document.createElement("p");
            message.className = "ai-terminal-launch-error";
            message.textContent =
              error instanceof Error ? error.message : String(error);
            host.appendChild(message);
          })
          .finally(() => {
            launch.disabled = false;
          });
      });
      host.append(title, detail, launch);
    } else if (entry) {
      const { createTerminalView } = await import("./terminal");
      if (activeTab !== "terminal" || version !== renderVersion) return;
      terminalView = createTerminalView(host, entry.run, {
        fontFamily: settings.terminalFont,
        fontSize: settings.terminalFontSize,
        onExit: () => {
          restart.hidden = false;
          restart.textContent = "Restart exited process";
        },
      });
    } else {
      host.textContent =
        "No terminal configured. Add one in AI Settings.";
    }
  }

  function render(): void {
    renderVersion += 1;
    if (activeTab === "chat") renderChat();
    else if (activeTab === "runs") renderRuns();
    else void renderTerminal(renderVersion);
  }

  render();
  return {
    render,
    resize: () => terminalView?.resize(),
    refreshTheme: () => terminalView?.setTheme(),
    syncWorkspaceContext: () => {
      const box = body.querySelector<HTMLInputElement>(".ai-workspace-context");
      if (box) box.checked = deps.getWorkspaceContext().enabled;
    },
    addAttachments: (paths) => {
      if (activeTab !== "chat") {
        activeTab = "chat";
        tabs.forEach((tab) =>
          tab.classList.toggle("active", tab.dataset.tab === "chat"),
        );
        render();
      }
      addAttachments(paths);
    },
    appendBubble: (role, text) => {
      if (activeTab !== "chat") {
        activeTab = "chat";
        tabs.forEach((tab) =>
          tab.classList.toggle("active", tab.dataset.tab === "chat"),
        );
        render();
      }
      const element = window.document.createElement("div");
      element.className = `ai-bubble ai-${role}`;
      element.textContent = text;
      const host = body.querySelector<HTMLElement>(".ai-messages");
      host?.appendChild(element);
      if (host) host.scrollTop = host.scrollHeight;
      return element;
    },
    resetWorkspaceContext: () => workspaceIndex.reset(),
    updateWorkspaceFile: (path, text) => workspaceIndex.onFileChanged(path, text),
    removeWorkspaceFile: (path) => workspaceIndex.onFileRemoved(path),
  };
}
