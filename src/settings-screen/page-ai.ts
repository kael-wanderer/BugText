import type { ActionsPageDeps } from "./page-ai-actions";
import type { CliInfo } from "../ai/engines";
import { pageHeader } from "./controls";
import { renderLocalCli } from "./page-ai-local-cli";
import { renderApi } from "./page-ai-api";
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
    if (sub === "use-for" || sub === "context" || sub === "actions") {
      const section = document.createElement("div");
      host.append(section);
      const loading = sub === "use-for"
        ? import("./page-ai-use-for").then(page => page.renderUseFor(section, deps))
        : sub === "context"
        ? import("./page-ai-context").then(page => page.renderContext(section, deps))
        : import("./page-ai-actions").then(page => page.renderActions(section, deps));
      return loading.catch(() => { section.textContent = "Could not load settings page."; });
    }
    else if (sub === "local-cli") renderLocalCli(host, deps);
    else if (sub === "mcp" && deps.mcp) renderMcpPage(host, deps.mcp);
    else renderApi(host, deps);
  },
};
