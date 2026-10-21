// Minimal in-memory localStorage for tests (Node env, no DOM needed).
class MemoryStorage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(k: string) {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.store.set(k, String(v));
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
  key(i: number) {
    return Array.from(this.store.keys())[i] ?? null;
  }
}

if (typeof (globalThis as any).localStorage === "undefined") {
  (globalThis as any).localStorage = new MemoryStorage();
}

// Small DOM fixture for Node-only settings tests. It models element creation,
// text, attributes and events; browser layout is covered by the manual smoke pass.
export function installTestDom(): void {
  class Element extends EventTarget {
    tagName: string;
    children: Element[] = [];
    parentElement: Element | null = null;
    dataset: Record<string, string> = {};
    style: Record<string, string> = {};
    attributes = new Map<string, string>();
    className = "";
    value = "";
    checked = false;
    disabled = false;
    hidden = false;
    type = "";
    id = "";
    scrollTop = 0;
    private text = "";
    constructor(tag: string) {
      super();
      this.tagName = tag.toUpperCase();
    }
    get textContent(): string {
      return this.text + this.children.map((c) => c.textContent).join("");
    }
    set textContent(value: string) {
      this.text = String(value ?? "");
      this.children = [];
    }
    set innerHTML(value: string) {
      this.text = value;
      this.children = [];
    }
    get innerHTML(): string {
      return this.textContent;
    }
    get isConnected(): boolean {
      return true;
    }
    get classList() {
      return {
        add: (...names: string[]) => {
          this.className = [
            ...new Set([...this.className.split(" "), ...names]),
          ].join(" ");
        },
        remove: (...names: string[]) => {
          this.className = this.className
            .split(" ")
            .filter((c) => !names.includes(c))
            .join(" ");
        },
        toggle: (name: string, force?: boolean) => {
          const on = force ?? !this.className.split(" ").includes(name);
          if (on) this.classList.add(name);
          else this.classList.remove(name);
          return on;
        },
        contains: (name: string) => this.className.split(" ").includes(name),
      };
    }
    append(...nodes: (Element | string)[]) {
      for (const node of nodes) {
        const child = typeof node === "string" ? new Element("#text") : node;
        if (typeof node === "string") child.textContent = node;
        child.parentElement = this;
        this.children.push(child);
      }
    }
    appendChild(node: Element) {
      this.append(node);
      return node;
    }
    replaceChildren(...nodes: Element[]) {
      this.text = "";
      this.children = [];
      this.append(...nodes);
    }
    replaceWith(node: Element) {
      if (!this.parentElement) return;
      const i = this.parentElement.children.indexOf(this);
      this.parentElement.children[i] = node;
      node.parentElement = this.parentElement;
    }
    remove() {
      if (this.parentElement)
        this.parentElement.children = this.parentElement.children.filter(
          (c) => c !== this,
        );
    }
    setAttribute(name: string, value: string) {
      this.attributes.set(name, String(value));
      if (name === "id") this.id = value;
    }
    getAttribute(name: string) {
      return this.attributes.get(name) ?? null;
    }
    removeAttribute(name: string) {
      this.attributes.delete(name);
    }
    matches(selector: string): boolean {
      const attr = selector.match(/\[([^=\]]+)(?:="([^"]*)")?\]/);
      if (attr) {
        const name = attr[1];
        const value = name.startsWith("data-")
          ? this.dataset[
              name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
            ]
          : this.getAttribute(name);
        if (value == null || (attr[2] !== undefined && value !== attr[2]))
          return false;
        selector = selector.replace(attr[0], "");
      }
      if (selector.startsWith("."))
        return this.className.split(" ").includes(selector.slice(1));
      if (selector.startsWith("#")) return this.id === selector.slice(1);
      return !selector || this.tagName === selector.toUpperCase();
    }
    querySelectorAll(selector: string): Element[] {
      return this.children.flatMap((c) => [
        ...(c.matches(selector) ? [c] : []),
        ...c.querySelectorAll(selector),
      ]);
    }
    contains(node: Element | null): boolean {
      return (
        node === this || this.children.some((child) => child.contains(node))
      );
    }
    querySelector(selector: string) {
      return this.querySelectorAll(selector)[0] ?? null;
    }
    focus() {
      doc.activeElement = this;
    }
    scrollIntoView() {}
    click() {
      if (!this.disabled) this.dispatchEvent(new Event("click"));
    }
  }
  const body = new Element("body");
  const doc = {
    body,
    activeElement: body,
    createElement: (tag: string) => new Element(tag),
    createTextNode: (text: string) => {
      const e = new Element("#text");
      e.textContent = text;
      return e;
    },
    getElementById: (id: string) => body.querySelector(`#${id}`),
  };
  Object.assign(globalThis, {
    document: doc,
    HTMLElement: Element,
    HTMLInputElement: Element,
    HTMLSelectElement: Element,
    window: Object.assign(new EventTarget(), { setTimeout, clearTimeout }),
    CSS: { escape: (s: string) => s },
  });
}
