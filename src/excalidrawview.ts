import {
  parseExcalidrawDocument,
  serializeExcalidrawDocument,
} from "./excalidraw-document";

type VendorModule = {
  mountExcalidraw: (
    host: HTMLElement,
    options: {
      initialData: unknown;
      theme: "light" | "dark";
      onChange: (
        elements: readonly unknown[],
        appState: unknown,
        files: unknown,
      ) => void;
    },
  ) => {
    destroy: () => void;
    exportPng: () => Promise<HTMLCanvasElement>;
    exportSvg: () => Promise<string>;
  };
};

export type ExcalidrawBoardHandle = {
  destroy: () => void;
  exportPng: () => Promise<HTMLCanvasElement>;
  exportSvg: () => Promise<string>;
};

let stylePromise: Promise<void> | null = null;
let vendorPromise: Promise<VendorModule> | null = null;

function loadStyles(): Promise<void> {
  if (stylePromise) return stylePromise;
  stylePromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLLinkElement>(
      'link[data-mdflow-excalidraw="true"]',
    );
    if (existing) {
      if (existing.sheet) resolve();
      else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Could not load Excalidraw styles.")), { once: true });
      }
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/vendor/excalidraw/bridge.css?v=0.18.0-m10-final";
    link.dataset.mdflowExcalidraw = "true";
    link.addEventListener("load", () => resolve(), { once: true });
    link.addEventListener(
      "error",
      () => reject(new Error("Could not load Excalidraw styles.")),
      { once: true },
    );
    document.head.appendChild(link);
  });
  return stylePromise;
}

async function loadVendor(): Promise<VendorModule> {
  if (vendorPromise) return vendorPromise;
  vendorPromise = new Promise((resolve, reject) => {
    const globalWindow = window as typeof window & {
      mdFlowExcalidraw?: VendorModule;
    };
    if (globalWindow.mdFlowExcalidraw) {
      resolve(globalWindow.mdFlowExcalidraw);
      return;
    }
    const script = document.createElement("script");
    script.type = "module";
    script.src = "/vendor/excalidraw/bridge.js?v=0.18.0-m10-final";
    script.dataset.mdflowExcalidraw = "true";
    script.addEventListener(
      "load",
      () => {
        if (globalWindow.mdFlowExcalidraw) {
          resolve(globalWindow.mdFlowExcalidraw);
        } else {
          reject(new Error("Excalidraw loaded without its mount API."));
        }
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => reject(new Error("Could not load the Excalidraw engine.")),
      { once: true },
    );
    document.head.appendChild(script);
  });
  return vendorPromise;
}

export async function mountExcalidrawBoard(
  host: HTMLElement,
  raw: string,
  onChange: (serialized: string) => void,
): Promise<ExcalidrawBoardHandle> {
  const scene = parseExcalidrawDocument(raw);
  await loadStyles();
  const vendor = await loadVendor();
  const theme =
    document.documentElement.dataset.theme === "light" ? "light" : "dark";
  let acceptingChanges = false;
  let lastSerialized = "";
  const stopAcceptingTimer = window.setTimeout(() => {
    acceptingChanges = true;
  }, 250);
  // Excalidraw fires onChange on every pointer frame (pan/zoom included), and
  // serializing a whole scene per frame stalls the board. Debounce the
  // serialization; the trailing run emits once interaction settles.
  let pending: { elements: readonly unknown[]; appState: unknown; files: unknown } | null =
    null;
  let flushTimer = 0;
  const flush = (): void => {
    window.clearTimeout(flushTimer);
    flushTimer = 0;
    if (!pending) return;
    const { elements, appState, files } = pending;
    pending = null;
    const serialized = serializeExcalidrawDocument(elements, appState, files);
    if (serialized === lastSerialized) return;
    lastSerialized = serialized;
    onChange(serialized);
  };
  const handle = vendor.mountExcalidraw(host, {
    initialData: scene,
    theme,
    onChange: (elements, appState, files) => {
      if (!acceptingChanges) return;
      pending = { elements, appState, files };
      window.clearTimeout(flushTimer);
      flushTimer = window.setTimeout(flush, 250);
    },
  });
  return {
    destroy: () => {
      window.clearTimeout(stopAcceptingTimer);
      flush();
      handle.destroy();
    },
    exportPng: handle.exportPng,
    exportSvg: handle.exportSvg,
  };
}
