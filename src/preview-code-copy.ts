import { flashCopied } from "./copy-feedback";

export function enhanceCodeCopy(root: ParentNode, copy: (text: string) => Promise<void>): void {
  for (const pre of root.querySelectorAll<HTMLElement>("pre.hljs")) {
    if (pre.closest(".code-block")) continue;
    const wrapper = document.createElement("div");
    wrapper.className = "code-block";
    pre.replaceWith(wrapper);
    wrapper.append(pre);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "code-copy";
    button.textContent = "Copy";
    button.setAttribute("aria-label", "Copy code");
    button.addEventListener("click", async () => {
      try {
        await copy(pre.querySelector("code")?.textContent ?? "");
        flashCopied(button, true);
      } catch {
        flashCopied(button, false);
      }
    });
    wrapper.append(button);
  }
}
