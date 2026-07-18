export type ExcalidrawScene = {
  elements: readonly unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
};

const TRANSIENT_APP_STATE = new Set([
  "collaborators",
  "contextMenu",
  "draggingElement",
  "editingElement",
  "editingGroupId",
  "editingLinearElement",
  "height",
  "multiElement",
  "offsetLeft",
  "offsetTop",
  "openMenu",
  "openPopup",
  "openSidebar",
  "previousSelectedElementIds",
  "resizingElement",
  "scrollX",
  "scrollY",
  "selectedElementIds",
  "selectedGroupIds",
  "selectionElement",
  "toast",
  "width",
  "zoom",
]);

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseExcalidrawDocument(raw: string): ExcalidrawScene {
  if (!raw.trim()) {
    return { elements: [], appState: {}, files: {} };
  }

  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error();
    }
    data = parsed as Record<string, unknown>;
  } catch {
    throw new Error("This file does not contain valid Excalidraw JSON.");
  }

  if (!Array.isArray(data.elements)) {
    throw new Error("This Excalidraw file is missing its elements array.");
  }

  return {
    elements: data.elements,
    appState: objectValue(data.appState),
    files: objectValue(data.files),
  };
}

function safeAppState(
  appState: Record<string, unknown>,
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(appState)) {
    if (
      TRANSIENT_APP_STATE.has(key) ||
      typeof value === "function" ||
      value instanceof Map ||
      value instanceof Set
    ) {
      continue;
    }
    clean[key] = value;
  }
  return clean;
}

export function serializeExcalidrawDocument(
  elements: readonly unknown[],
  appState: unknown,
  files: unknown,
): string {
  return JSON.stringify(
    {
      type: "excalidraw",
      version: 2,
      source: "mdflow",
      elements,
      appState: safeAppState(objectValue(appState)),
      files: objectValue(files),
    },
    null,
    2,
  );
}
