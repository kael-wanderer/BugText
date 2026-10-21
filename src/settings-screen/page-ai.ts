import type { CliInfo } from "../ai/engines";
import { pageHeader } from "./controls";
import { renderLocalCli } from "./page-ai-local-cli";
import { renderApi } from "./page-ai-api";
import { renderUseFor } from "./page-ai-use-for";
import type { SettingsPage } from "./screen";
export type AiPageDeps = {
  getClis(): CliInfo[];
  rescan(): Promise<void>;
  getModelsCache(): Record<string, string[]>;
};
export const aiPage: SettingsPage = {
  id: "ai",
  render(host, deps, sub = "use-for") {
    pageHeader(host, "ai");
    if (sub === "use-for") renderUseFor(host, deps);
    else if (sub === "local-cli") renderLocalCli(host, deps);
    else renderApi(host, deps);
  },
};
