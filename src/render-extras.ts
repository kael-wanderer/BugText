let counter = 0;
let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid(): Promise<typeof import("mermaid").default> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "strict",
        // Plain SVG text labels: PDF export (Typst) cannot draw HTML labels
        // inside <foreignObject>.
        htmlLabels: false,
        flowchart: { htmlLabels: false },
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

export async function enhancePreview(container: HTMLElement): Promise<void> {
  const blocks =
    container.querySelectorAll<HTMLElement>("code.language-mermaid");
  if (blocks.length === 0) return;

  const mermaid = await loadMermaid();
  await Promise.all(
    Array.from(blocks, async (block) => {
      if (!block.isConnected) return;
      const code = block.textContent ?? "";
      const host = document.createElement("div");
      host.className = "mermaid-rendered";
      const pre = block.closest("pre");
      (pre ?? block).replaceWith(host);
      const id = `mmd-${counter++}`;
      try {
        const { svg } = await mermaid.render(id, code);
        if (host.isConnected) host.innerHTML = svg;
      } catch (error) {
        host.textContent = `Mermaid error: ${String(error)}`;
        host.classList.add("mermaid-error");
      }
    }),
  );
}
