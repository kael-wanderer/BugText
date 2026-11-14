import { expect, it } from "vitest";

// The project has no Node type definitions; give fs the two calls used here.
const { readdirSync, readFileSync } = (await import("node:fs" as string)) as {
  readdirSync: (path: string) => string[];
  readFileSync: (path: string, encoding: "utf8") => string;
};

type Capability = { windows?: string[]; permissions?: (string | { identifier: string })[] };
const DIR = "src-tauri/capabilities";
const capabilities: Capability[] = readdirSync(DIR)
  .filter(name => name.endsWith(".json"))
  .map(name => JSON.parse(readFileSync(`${DIR}/${name}`, "utf8")) as Capability);

function permissionsFor(label: string): string[] {
  return capabilities
    .filter(c => (c.windows ?? []).includes(label))
    .flatMap(c => (c.permissions ?? []).map(p => (typeof p === "string" ? p : p.identifier)));
}

it("lets a secondary window destroy itself after its close handler runs", () => {
  // main.ts registers onCloseRequested on secondary windows; Tauri then closes the
  // window from JavaScript with destroy(), which is refused without this permission.
  expect(permissionsFor("window-*")).toContain("core:window:allow-destroy");
});

it("does not grant destroy to the main window, which registers no close handler", () => {
  expect(permissionsFor("main")).not.toContain("core:window:allow-destroy");
});
