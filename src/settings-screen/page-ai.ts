import type { CliInfo } from "../ai/engines";
import { pageHeader } from "./controls";
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
    else {
      // Temporary route placeholders; Tasks 8/9 supply the two engine pages.
      const heading = document.createElement("h3");
      heading.textContent = sub === "local-cli" ? "Local CLI" : "API providers";
      host.append(heading);
    }
  },
};
