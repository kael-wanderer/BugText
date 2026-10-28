import { invoke } from "@tauri-apps/api/core";
export type ConversationMessage = { role: "user" | "assistant" | "system"; text: string; time: number; engine?: string; context?: unknown };
export type Conversation = { version: 1; id: string; title: string; updatedAt: number; messages: ConversationMessage[]; earlierMessagesRemoved?: boolean };
export type ConversationEntry = Pick<Conversation, "id" | "title" | "updatedAt">;
export function conversationTitle(question: string): string { return question.replace(/\s+/g, " ").trim().slice(0, 60); }
export function capConversation(value: Conversation): Conversation {
  return { ...value, messages: value.messages.slice(-400), earlierMessagesRemoved: value.earlierMessagesRemoved || value.messages.length > 400 };
}
export const EARLIER_MESSAGES_NOTICE = "Earlier messages were removed";
export function listConversations(folder: string | null): Promise<ConversationEntry[]> { return invoke("conversations_list", { folder }); }
export async function readConversation(folder: string | null, id: string): Promise<Conversation> {
  const value: Conversation = JSON.parse(await invoke<string>("conversation_read", { folder, id }));
  if (value.version !== 1 || value.id !== id || typeof value.title !== "string" || !Array.isArray(value.messages) || !value.messages.every(m => m && ["user", "assistant", "system"].includes(m.role) && typeof m.text === "string" && typeof m.time === "number")) throw new Error("Invalid conversation");
  return capConversation(value);
}
export async function writeConversation(folder: string | null, value: Conversation): Promise<void> {
  if (!value.messages.length) return;
  await invoke("conversation_write", { folder, id: value.id, json: JSON.stringify(capConversation(value)) });
}
export function deleteConversation(folder: string | null, id: string): Promise<void> { return invoke("conversation_delete", { folder, id }); }
export function restoreConversation(folder: string | null, id: string): Promise<void> { return invoke("conversation_restore", { folder, id }); }
export async function migrateHistory(historyKey: string, legacyHistoryKey?: string, storage: Pick<Storage, "getItem" | "removeItem"> = localStorage, write = writeConversation): Promise<Conversation | null> {
  const keys = [...new Set([historyKey, legacyHistoryKey].filter((key): key is string => !!key))];
  const key = keys.find(key => storage.getItem(key) !== null);
  if (!key) return null;
  const parsed: unknown = JSON.parse(storage.getItem(key)!);
  if (!Array.isArray(parsed)) throw new Error("Invalid earlier chat");
  const messages: ConversationMessage[] = parsed.filter(m => m && ["user", "assistant", "system"].includes(m.role) && typeof m.content === "string").map(m => ({ role: m.role, text: m.content, time: Date.now() }));
  if (!messages.length) return null;
  // A deterministic id makes retrying a successful write with a failed key removal safe.
  const bytes = new TextEncoder().encode(key); let hash = 2166136261;
  for (const b of bytes) hash = Math.imul(hash ^ b, 16777619);
  const conversation = capConversation({ version: 1, id: `earlier-${(hash >>> 0).toString(16)}`, title: "Earlier chat", updatedAt: Date.now(), messages });
  await write(null, conversation);
  storage.removeItem(key);
  return conversation;
}
