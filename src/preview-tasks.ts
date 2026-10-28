export function enhancePreviewTasks(root: ParentNode, onToggle: (line: number) => void): void {
  for (const item of Array.from(root.querySelectorAll<HTMLElement>("li.task[data-line]"))) {
    const line = Number(item.dataset.line);
    if (!Number.isInteger(line) || line < 1) continue;
    const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
    let text = walker.nextNode();
    while (text && !/^\[[ xX]\]/.test(text.textContent ?? "")) text = walker.nextNode();
    if (!text) continue;
    const raw = text.textContent ?? "", marker = { offset: 1, checked: raw[1].toLowerCase() === "x" };
    const box = document.createElement("span");
    box.className = "task-box"; box.setAttribute("role", "checkbox");
    box.setAttribute("aria-checked", String(marker.checked)); box.setAttribute("tabindex", "0");
    box.setAttribute("aria-label", raw.slice(marker.offset + 1).trim());
    const toggle = (event: Event) => { event.preventDefault(); onToggle(line); };
    box.addEventListener("click", toggle);
    box.addEventListener("keydown", (event) => { if (event instanceof KeyboardEvent && event.key === " ") toggle(event); });
    const after = document.createTextNode(raw.slice(marker.offset + 1));
    text.parentNode?.insertBefore(box, text);
    text.textContent = raw.slice(0, marker.offset);
    text.parentNode?.insertBefore(after, box.nextSibling);
    item.classList.toggle("task-done", marker.checked);
  }
}
