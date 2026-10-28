// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { buildMessages } from "../ai/conversation";
import { renderContextSent } from "../ai/context-sent";
import { renderContextChips, parseContextChips } from "../ai/context-chips";
it("reports only retained context and renders source links and trim counts as text", () => {
  const built = buildMessages({ history: [], prompt: "Ask", docText: "abc", selection: "", notePath: "<img>.md", editMode: false, files: [{ kind: "text", name: "omitted.txt", content: "file" }], retrieved: [{ path: "source.md", heading: "", text: "excerpt" }], maxContextChars: 110 });
  expect(built.context.files).toEqual([]); expect(built.context.note?.chars).toBe(3); expect(built.context.excerpts).toHaveLength(1); expect(built.context.trimmed).toBeGreaterThan(0);
  const open = vi.fn(); const view = renderContextSent(built.context, open)!; expect(view.textContent).toContain("Context sent"); expect(view.textContent).toContain("trimmed to fit"); expect(view.querySelector("img")).toBeNull(); view.querySelector("button")!.click(); expect(open).toHaveBeenCalledWith("source.md");
});
it("locks an excluded note chip and supports prompt-only choices", () => {
  const host = document.createElement("div"); const change = vi.fn();
  renderContextChips(host, { state: parseContextChips({ note: false, search: false }), path: "secret.md", selection: false, folder: true, k: 6, excluded: true, disabled: false, change, add: vi.fn() });
  expect(host.querySelector("button")!.disabled).toBe(true); expect(host.textContent).toContain("is excluded");
  const built = buildMessages({ history: [], prompt: "Hello", docText: "", selection: "", editMode: false, maxContextChars: 4000 }); expect(built.messages[1].content).toBe("Hello");
});
