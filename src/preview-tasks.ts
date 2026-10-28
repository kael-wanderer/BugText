// Checkboxes for task list items in the rendered preview. They are built here,
// after sanitizing, from DOM APIs only; the item text never passes through
// innerHTML. Clicking one reports the item's source line.

/** The text node holding a task item's leading `[ ]` / `[x]`, if any. */
function markerNode(item: HTMLElement): Text | null {
  const first = item.firstElementChild;
  const container = first?.tagName === "P" && item.firstChild === first ? first : item;
  const node = container.firstChild;
  if (node?.nodeType !== Node.TEXT_NODE || !/^\[[ xX]\](?:\s|$)/.test(node.textContent ?? "")) return null;
  return node as Text;
}

function taskItems(root: ParentNode): { item: HTMLElement; node: Text; checked: boolean }[] {
  const found = [];
  for (const item of Array.from(root.querySelectorAll<HTMLElement>("li.task"))) {
    const node = markerNode(item);
    if (node) found.push({ item, node, checked: node.data[1] !== " " });
  }
  return found;
}

/** Removes the marker and the space after it from the start of `node`. */
function stripMarker(node: Text): void {
  node.data = node.data.slice(3).replace(/^[ \t]/, "");
}

/**
 * Replaces task markers with checkboxes. `onToggle` receives the 1-based
 * source line and returns whether it changed the source, so the box can flip
 * before the next render; without it the boxes are shown but cannot be changed.
 */
export function enhancePreviewTasks(root: ParentNode, onToggle: ((line: number) => boolean) | null): void {
  for (const { item, node, checked } of taskItems(root)) {
    const line = Number(item.dataset.line);
    stripMarker(node);
    const box = document.createElement("span");
    box.className = "task-box";
    box.setAttribute("role", "checkbox");
    box.setAttribute("aria-checked", String(checked));
    box.setAttribute("aria-label", (node.parentNode?.textContent ?? "").trim().slice(0, 200) || "Task");
    item.classList.toggle("task-done", checked);
    if (onToggle && Number.isInteger(line) && line > 0) {
      box.tabIndex = 0;
      const toggle = (event: Event): void => {
        event.preventDefault();
        if (!onToggle(line)) return;
        const now = box.getAttribute("aria-checked") !== "true";
        box.setAttribute("aria-checked", String(now));
        item.classList.toggle("task-done", now);
      };
      box.addEventListener("mousedown", (event) => event.preventDefault());
      box.addEventListener("click", toggle);
      box.addEventListener("keydown", (event) => {
        if (event.key === " " || event.key === "Enter") toggle(event);
      });
    } else {
      box.setAttribute("aria-disabled", "true");
    }
    node.parentNode?.insertBefore(box, node);
  }
}

/** Export keeps tasks as plain ☐ / ☑ marks. */
export function staticTaskMarks(root: ParentNode): void {
  for (const { node, checked } of taskItems(root)) {
    stripMarker(node);
    node.data = `${checked ? "☑" : "☐"} ${node.data}`;
  }
}
