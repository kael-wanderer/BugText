import { expect, it, vi } from "vitest";
const clipboard = vi.hoisted(() => vi.fn(async (_text: string) => {}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: clipboard }));
import { copyQuote, rewriteLastQuote } from "../pdf-annotations/quote";
it("copies a source link and rewrites only the last quote", async () => {
  const text = await copyQuote({ page: 4, quote: "hello", id: "abc123" }, "Paper", "/root/papers/a.pdf", "/root");
  expect(clipboard).toHaveBeenCalledWith("> hello\n> — [Paper, p. 4](papers/a.pdf#page=4&annotation=abc123)");
  expect(rewriteLastQuote(text, "/root/notes")).toContain("../papers/a.pdf#page=4&annotation=abc123");
  expect(rewriteLastQuote("other", "/root/notes")).toBeNull();
});
