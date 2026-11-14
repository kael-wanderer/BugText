export type MermaidResult = { code: string; error: string | null; line: number | null };
const results = new WeakMap<HTMLElement, MermaidResult>();

export function mermaidResult(host: HTMLElement): MermaidResult | undefined {
  return results.get(host);
}

let counter = 0;
let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid(): Promise<typeof import("mermaid").default> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "strict",
        suppressErrorRendering: true,
        // Plain SVG text labels: PDF export (Typst) cannot draw HTML labels
        // inside <foreignObject>.
        htmlLabels: false,
        flowchart: { htmlLabels: false },
        // Mermaid 12 defaults to the ELK layout (a 1.5 MB lazy chunk) and the
        // "neo" look; keep the Mermaid 11 appearance that export was tuned for.
        layout: "dagre",
        look: "classic",
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
      const sourceLine = Number(pre?.getAttribute("data-line"));
      const line = Number.isInteger(sourceLine) && sourceLine > 0 ? sourceLine : null;
      if (line !== null) host.setAttribute("data-line", String(line));
      const result: MermaidResult = { code, error: null, line };
      results.set(host, result);
      (pre ?? block).replaceWith(host);
      const id = `mmd-${counter++}`;
      try {
        const { svg } = await mermaid.render(id, code);
        if (host.isConnected) host.innerHTML = svg;
      } catch (error) {
        result.error = String(error);
        host.textContent = `Mermaid error: ${result.error}`;
        host.classList.add("mermaid-error");
      } finally {
        for (const renderId of [id, `d${id}`]) {
          const leftover = document.getElementById(renderId);
          if (leftover && !host.contains(leftover)) leftover.remove();
        }
      }
    }),
  );
}
