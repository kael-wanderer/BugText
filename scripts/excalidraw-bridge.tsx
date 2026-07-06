import React from "react";
import { createRoot } from "react-dom/client";
import {
  Excalidraw,
  exportToCanvas,
  exportToSvg,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

export type BridgeOptions = {
  initialData: unknown;
  theme: "light" | "dark";
  onChange: (
    elements: readonly unknown[],
    appState: unknown,
    files: unknown,
  ) => void;
};

type ExcalidrawApi = {
  getSceneElements: () => readonly unknown[];
  getAppState: () => unknown;
  getFiles: () => unknown;
};

export type BridgeHandle = {
  destroy: () => void;
  exportPng: () => Promise<HTMLCanvasElement>;
  exportSvg: () => Promise<string>;
};

function mountExcalidraw(
  host: HTMLElement,
  options: BridgeOptions,
): BridgeHandle {
  const root = createRoot(host);
  let api: ExcalidrawApi | null = null;
  root.render(
    <Excalidraw
      initialData={options.initialData as never}
      theme={options.theme}
      onChange={options.onChange as never}
      excalidrawAPI={(nextApi) => {
        api = nextApi as unknown as ExcalidrawApi;
      }}
    />,
  );
  const scene = () => {
    if (!api) throw new Error("The Excalidraw board is still loading.");
    return {
      elements: api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles(),
    };
  };
  return {
    destroy: () => root.unmount(),
    exportPng: () => exportToCanvas(scene() as never),
    exportSvg: async () => {
      const svg = await exportToSvg(scene() as never);
      return new XMLSerializer().serializeToString(svg);
    },
  };
}

(
  globalThis as typeof globalThis & {
    BugterExcalidraw?: { mountExcalidraw: typeof mountExcalidraw };
  }
).BugterExcalidraw = { mountExcalidraw };
