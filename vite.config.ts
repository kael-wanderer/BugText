/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({

  test: {
    environment: "node",
    setupFiles: ["src/__tests__/setup.ts"],
    include: ["src/__tests__/**/*.test.ts"],
  },

  build: {
    // Mermaid's optional diagram engines and fontkit (PDF saves with non-Latin
    // text) are lazy chunks; keep the startup bundle small while allowing those
    // on-demand engines to exceed 500 kB.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.endsWith("/src/search.ts")) return "folder-search";
          if (!id.includes("node_modules")) return;
          if (id.includes("@codemirror/commands/")) return "editor-commands";
          if (id.includes("@codemirror/lang-markdown/")) return "editor-markdown";
          if (id.includes("@codemirror/language/")) return "editor-language";
          if (id.includes("@codemirror/state/")) return "editor-state";
          if (id.includes("@codemirror/view/")) return "editor-view";
          if (id.includes("markdown-it") || id.includes("highlight.js")) return "markdown";
          if (id.includes("@tauri-apps")) return "tauri";
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
