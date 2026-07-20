const BY_EXTENSION: Record<string, string> = {
  md: "md",
  markdown: "md",
  txt: "txt",
  json: "json",
  html: "html",
  htm: "html",
  js: "js",
  jsx: "js",
  ts: "ts",
  tsx: "ts",
  yaml: "yaml",
  yml: "yaml",
  sql: "sql",
  pdf: "pdf",
  excalidraw: "excalidraw",
  mind: "mind",
};

export function fileIcon(name: string, isDir: boolean): string {
  if (isDir) return "folder";
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return BY_EXTENSION[extension] ?? "file";
}

export const FILE_ICON_TEXT: Readonly<Record<string, string>> = {
  md: "MD",
  txt: "T",
  json: "{}",
  html: "<>",
  js: "JS",
  ts: "TS",
  yaml: "YML",
  sql: "SQL",
  pdf: "PDF",
  excalidraw: "EX",
  mind: "M",
  file: "·",
};
