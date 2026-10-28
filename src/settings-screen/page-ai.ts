import { renderActions, type ActionsPageDeps } from "./page-ai-actions";
import type { CliInfo } from "../ai/engines";
import { pageHeader } from "./controls";
import { renderLocalCli } from "./page-ai-local-cli";
import { renderApi } from "./page-ai-api";
import { renderUseFor } from "./page-ai-use-for";
import { renderMcpPage, type McpPageDeps } from "./page-ai-mcp";
import type { SettingsPage } from "./screen";
export type AiPageDeps = {
  getClis(): CliInfo[];
  rescan(): Promise<void>;
  getModelsCache(): Record<string, string[]>;
  mcp?: McpPageDeps;
  actions?: ActionsPageDeps;
};
export const aiPage: SettingsPage = {
  id: "ai",
  render(host, deps, sub = "use-for") {
    pageHeader(host, "ai");
    if (sub === "use-for") renderUseFor(host, deps);
    else if (sub === "actions") renderActions(host, deps);
    else if (sub === "local-cli") renderLocalCli(host, deps);
    else if (sub === "mcp" && deps.mcp) renderMcpPage(host, deps.mcp);
    else renderApi(host, deps);
  },
};
