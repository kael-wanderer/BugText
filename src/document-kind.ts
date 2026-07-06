export function isHtmlFile(pathOrName: string | null | undefined): boolean {
  return /\.html?$/i.test(pathOrName ?? "");
}

export function isPdfFile(pathOrName: string | null | undefined): boolean {
  return /\.pdf$/i.test(pathOrName ?? "");
}

export function isExcalidrawFile(
  pathOrName: string | null | undefined,
): boolean {
  return /\.excalidraw$/i.test(pathOrName ?? "");
}

export function isMindmapFile(
  pathOrName: string | null | undefined,
): boolean {
  return /\.mind$/i.test(pathOrName ?? "");
}

export function isMarkdownFile(pathOrName: string | null | undefined): boolean {
  if (!pathOrName || !/[.]/.test(pathOrName.split(/[\\/]/).pop() ?? "")) {
    return true;
  }
  return /\.(md|markdown)$/i.test(pathOrName);
}

export type EditorLanguage =
  | "markdown"
  | "html"
  | "typescript"
  | "javascript"
  | "json"
  | "yaml"
  | "plain";

export type FileLanguageInfo = {
  editor: EditorLanguage;
  icon: string;
  label: string;
};

export function fileLanguageInfo(
  pathOrName: string | null | undefined,
): FileLanguageInfo {
  const name = pathOrName?.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (/\.html?$/.test(name)) return { editor: "html", icon: "html", label: "HTML" };
  if (/\.tsx?$/.test(name)) {
    return {
      editor: "typescript",
      icon: "ts",
      label: name.endsWith(".tsx") ? "TSX" : "TypeScript",
    };
  }
  if (/\.jsx?$/.test(name)) {
    return {
      editor: "javascript",
      icon: "js",
      label: name.endsWith(".jsx") ? "JSX" : "JavaScript",
    };
  }
  if (/\.json$/.test(name)) return { editor: "json", icon: "json", label: "JSON" };
  if (/\.ya?ml$/.test(name)) return { editor: "yaml", icon: "yaml", label: "YAML" };
  if (isMarkdownFile(pathOrName)) {
    return { editor: "markdown", icon: "md", label: "Markdown" };
  }
  if (isPdfFile(pathOrName)) return { editor: "plain", icon: "pdf", label: "PDF" };
  if (isExcalidrawFile(pathOrName)) {
    return { editor: "plain", icon: "excalidraw", label: "Excalidraw" };
  }
  if (isMindmapFile(pathOrName)) {
    return { editor: "plain", icon: "mind", label: "Mindmap" };
  }
  return { editor: "plain", icon: "txt", label: "Plain text" };
}

export type DocumentViewMode = "editor" | "preview" | "split";

export function documentViewModes(
  pathOrName: string | null | undefined,
): readonly DocumentViewMode[] {
  if (isPdfFile(pathOrName)) return ["preview"];
  if (isExcalidrawFile(pathOrName) || isMindmapFile(pathOrName)) {
    return ["preview"];
  }
  if (isMarkdownFile(pathOrName) || isHtmlFile(pathOrName)) {
    return ["editor", "preview", "split"];
  }
  return ["editor"];
}

export function normalizeDocumentViewMode(
  pathOrName: string | null | undefined,
  mode: string,
): DocumentViewMode {
  const modes = documentViewModes(pathOrName);
  return modes.includes(mode as DocumentViewMode)
    ? (mode as DocumentViewMode)
    : modes[0];
}

// Inject only a zoom style. The preview iframe runs no scripts (sandbox is
// allow-same-origin), so the parent reads contentDocument to apply zoom and
// auto-fit in place — no reload, no white flash.
export function htmlWithPreviewZoom(html: string, zoom: number): string {
  const injection = `<style data-bugter-preview-zoom>html{zoom:${zoom}!important}</style>`;
  const headEnd = html.search(/<\/head\s*>/i);
  if (headEnd >= 0) {
    return `${html.slice(0, headEnd)}${injection}${html.slice(headEnd)}`;
  }
  return `${injection}${html}`;
}

export function htmlPreviewLayout(
  contentWidth: number,
  contentHeight: number,
  zoom: number,
): {
  transform: string;
  width: string;
  height: string;
  canvasWidth: string;
  canvasHeight: string;
} {
  const safeZoom = Math.max(0.1, zoom);
  const width = Math.max(1, contentWidth);
  const height = Math.max(1, contentHeight);
  return {
    transform: `scale(${safeZoom})`,
    width: `${width}px`,
    height: `${height}px`,
    canvasWidth: `${width * safeZoom}px`,
    canvasHeight: `${height * safeZoom}px`,
  };
}
