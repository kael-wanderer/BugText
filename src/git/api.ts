import { invoke } from "@tauri-apps/api/core";
import type { GitAction, GitActionRequest, GitActionResult, GitDiagnostics, GitDiff, GitRepoInfo, GitStatus } from "./model";
export const gitDiagnostics = (refresh = false) => invoke<GitDiagnostics>("git_diagnostics", { refresh });
export const gitRepo = (folder: string) => invoke<GitRepoInfo>("git_repo", { req: { folder } });
export const gitStatus = (folder: string) => invoke<GitStatus>("git_status", { req: { folder } });
export const gitDiff = (folder: string, path: string) => invoke<GitDiff>("git_diff", { req: { folder, path } });
export const gitAction = (req: GitActionRequest) => invoke<GitActionResult>("git_action", { req });
export const gitCancel = (requestId: string) => invoke<void>("git_cancel", { requestId });
export function newAction(folder: string, action: GitAction, paths: string[] = [], message: string | null = null): GitActionRequest {
  return { folder, request_id: crypto.randomUUID(), action, paths, message };
}
