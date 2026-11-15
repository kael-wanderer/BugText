// The app's tsconfig carries no Node types; the guide validator and its tests
// run only under Vitest, so they declare the few Node calls they need.
declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { isDirectory(): boolean; isFile(): boolean };
}

declare module "node:path" {
  export function join(...parts: string[]): string;
}
