import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

export type OpenResult = { path: string; contents: string } | null;

const FILTERS = [
  {
    name: "Documents",
    extensions: [
      "md", "markdown", "txt", "html", "htm", "pdf",
      "json", "yaml", "yml", "toml", "xml", "csv", "tsv", "css", "js", "ts",
    ],
  },
];

export async function openFile(): Promise<OpenResult> {
  const path = await open({ multiple: false, filters: FILTERS });
  if (typeof path !== "string") return null;
  if (path.toLowerCase().endsWith(".pdf")) {
    return { path, contents: "" };
  }
  const contents = await invoke<string>("read_file", { path });
  return { path, contents };
}

export async function pickSavePath(): Promise<string | null> {
  return save({ filters: FILTERS });
}

export function pickExportPath(ext: string): Promise<string | null> {
  return save({
    filters: [
      { name: ext.toUpperCase(), extensions: [ext] },
    ],
  }).then((path) => path ?? null);
}

export function pickImagePath(): Promise<string | null> {
  return open({
    multiple: false,
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg"] },
    ],
  }).then((path) => (typeof path === "string" ? path : null));
}

export function writeFile(path: string, contents: string): Promise<void> {
  return invoke("save_file", { path, contents });
}

export async function getInitialFile(): Promise<OpenResult> {
  const path = await invoke<string | null>("get_initial_file");
  if (!path) return null;
  if (path.toLowerCase().endsWith(".pdf")) return { path, contents: "" };
  const contents = await invoke<string>("read_file", { path });
  return { path, contents };
}
