import type { CliInfo } from "../ai/engines";
import { pageHeader } from "./controls";
import { renderLocalCli } from "./page-ai-local-cli";
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
    else {
      // Temporary route placeholders; Task 9 supplies the API providers page.
      const heading = document.createElement("h3");
      heading.textContent = "API providers";
      host.append(heading);
    }
  },
};
