import type { Settings } from "../settings";
import { button, caption, pageHeader } from "./controls";

export type McpClient = "claude" | "codex";
export type McpActivity = { time: number; client: string; text: string };
export type McpClientStatus = { found: boolean; registered: boolean; command: string };
export type McpPageDeps = {
  getSettings(): Settings;
  onSettingsChange(settings: Settings): void;
  getStatus(): { enabled: boolean; connected: number; roots: { folder: string; window: string }[] };
  getClientStatus(client: McpClient): Promise<McpClientStatus>;
  register(client: McpClient): Promise<void>;
  unregister(client: McpClient): Promise<void>;
  copy(text: string): Promise<void>;
};

let activity: McpActivity[] = [];
export function appendMcpActivity(item: McpActivity): void {
  activity = [...activity, item].slice(-50);
}
export function getMcpActivity(): McpActivity[] { return activity.map((item) => ({ ...item })); }

function text(tag: string, value: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
}

function statusText(status: ReturnType<McpPageDeps["getStatus"]>): string {
  return status.enabled ? `On · ${status.connected} agent(s) connected` : "Off — agents get: MCP is turned off in BugText Settings ▸ AI ▸ MCP server.";
}

export function renderMcpPage(host: HTMLElement, deps: McpPageDeps): void {
  host.replaceChildren();
  pageHeader(host, "ai");
  const page = document.createElement("div");
  page.className = "st-mcp-page";
  page.append(caption("MCP SERVER"));
  page.append(text("p", "Lets Claude Code or Codex in your own terminal read, edit and create notes through BugText. They see unsaved text, and their edits appear in open tabs at once and save to disk. They can only reach folders open in BugText.", "st-note"));

  const serverCard = document.createElement("section");
  serverCard.className = "st-mcp-card";
  const toggleRow = document.createElement("label");
  toggleRow.className = "st-mcp-toggle-row";
  toggleRow.dataset.setting = "mcp-enabled";
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = deps.getSettings().mcp.enabled;
  toggle.setAttribute("aria-label", "Allow agents to connect");
  const toggleText = text("strong", "Allow agents to connect");
  const serverStatus = text("span", statusText(deps.getStatus()), deps.getStatus().enabled ? "st-mcp-status is-on" : "st-mcp-status");
  toggleRow.append(toggle, toggleText, serverStatus);
  toggle.addEventListener("change", () => {
    const next = structuredClone(deps.getSettings());
    next.mcp.enabled = toggle.checked;
    deps.onSettingsChange(next);
    serverStatus.textContent = statusText({ ...deps.getStatus(), enabled: toggle.checked });
    serverStatus.classList.toggle("is-on", toggle.checked);
  });
  const roots = text("p", "", "st-note");
  roots.dataset.setting = "mcp-roots";
  const rootItems = deps.getStatus().roots.map((root) => `${root.folder} (${root.window})`);
  roots.textContent = rootItems.length ? `Reachable now: ${rootItems.join(" · ")}` : "No folders are currently reachable.";
  serverCard.append(toggleRow, roots);
  page.append(serverCard);

  page.append(caption("CONNECT AN AGENT"));
  const cards = document.createElement("div");
  cards.className = "st-mcp-clients";
  page.append(cards);
  const error = text("p", "", "st-field-error");
  error.setAttribute("role", "alert");
  page.append(error);

  const drawClient = async (client: McpClient, label: string) => {
    let clientStatus: McpClientStatus;
    try { clientStatus = await deps.getClientStatus(client); }
    catch { clientStatus = { found: false, registered: false, command: "" }; }
    const card = document.createElement("section");
    card.className = "st-mcp-card st-mcp-client-card";
    card.dataset.client = client;
    const heading = document.createElement("div");
    heading.className = "st-mcp-client-heading";
    heading.append(text("strong", label), text("span", clientStatus.registered ? "Registered" : "Not registered", clientStatus.registered ? "st-mcp-status is-on" : "st-note"));
    const command = text("pre", clientStatus.command, "st-mcp-command");
    const actions = document.createElement("div");
    actions.className = "st-btns";
    actions.append(button("Copy", () => { void deps.copy(clientStatus.command).catch((e) => { error.textContent = String(e); }); }));
    if (clientStatus.found && !clientStatus.registered) {
      const register = button("Register", () => {
        void deps.register(client).then(() => renderMcpPage(host, deps)).catch((e) => { error.textContent = String(e); });
      }, "primary");
      register.dataset.action = "register";
      actions.append(register);
    }
    if (clientStatus.registered) {
      const remove = button("Remove", () => {
        void deps.unregister(client).then(() => renderMcpPage(host, deps)).catch((e) => { error.textContent = String(e); });
      });
      remove.dataset.action = "remove";
      actions.append(remove);
    }
    card.append(heading, command, actions);
    cards.append(card);
  };
  void Promise.all([
    drawClient("claude", "Claude Code"),
    drawClient("codex", "Codex CLI"),
  ]);

  page.append(text("p", "Restart the agent's session after registering.", "st-note"));
  page.append(caption("RECENT AGENT ACTIVITY"));
  const log = document.createElement("div");
  log.className = "st-mcp-activity";
  log.dataset.setting = "mcp-activity";
  for (const item of getMcpActivity().slice().reverse()) {
    const row = document.createElement("div");
    row.className = "st-mcp-activity-row";
    row.append(text("time", new Date(item.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })), text("strong", item.client), text("span", item.text));
    log.append(row);
  }
  page.append(log, text("p", "This session only. Not saved.", "st-note"));
  host.append(page);
}

export const mcpPage = {
  id: "ai" as const,
  render(host: HTMLElement, deps: McpPageDeps) { renderMcpPage(host, deps); },
};
