import { expect, it, vi } from "vitest";
import { capConversation, conversationTitle, migrateHistory, type Conversation } from "../ai/conversations";
it("derives a one-line title and caps 400 messages", () => {
  expect(conversationTitle(" one\n two ")).toBe("one two"); expect(conversationTitle("x".repeat(80))).toHaveLength(60);
  const value: Conversation = { version: 1, id: "a", title: "T", updatedAt: 1, messages: Array.from({ length: 402 }, (_, time) => ({ role: "user", text: `${time}`, time })) };
  const capped = capConversation(value); expect(capped.messages).toHaveLength(400); expect(capped.messages[0].text).toBe("2"); expect(capped.earlierMessagesRemoved).toBe(true);
});
it("migrates history to No folder and removes only after successful write", async () => {
  const storage = { getItem: vi.fn(() => JSON.stringify([{ role: "user", content: "Old question" }])), removeItem: vi.fn() };
  const failed = vi.fn(async () => { throw Error("disk full"); });
  await expect(migrateHistory("window", "window", storage, failed)).rejects.toThrow(); expect(storage.removeItem).not.toHaveBeenCalled();
  const write = vi.fn(async () => {}); const result = await migrateHistory("window", "window", storage, write);
  expect(write).toHaveBeenCalledWith(null, expect.objectContaining({ title: "Earlier chat", messages: [expect.objectContaining({ text: "Old question" })] })); expect(storage.removeItem).toHaveBeenCalledWith("window"); expect(result?.id).toBeTruthy();
});
it("leaves unreadable old history in place without failing", async () => {
  const storage = { getItem: vi.fn(() => "{broken"), removeItem: vi.fn() }; const write = vi.fn(async () => {});
  expect(await migrateHistory("window", "window", storage, write)).toBeNull(); expect(write).not.toHaveBeenCalled(); expect(storage.removeItem).not.toHaveBeenCalled();
});
