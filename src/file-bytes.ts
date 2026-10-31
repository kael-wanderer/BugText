import { invoke } from "@tauri-apps/api/core";

export async function readFileBytes(path: string): Promise<Uint8Array> {
  return new Uint8Array(await invoke<ArrayBuffer>("read_file_bytes", { path }));
}
