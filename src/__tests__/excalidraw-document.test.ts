import { describe, expect, it } from "vitest";
import {
  parseExcalidrawDocument,
  serializeExcalidrawDocument,
} from "../excalidraw-document";

describe("parseExcalidrawDocument", () => {
  it("creates an empty scene for a new file", () => {
    expect(parseExcalidrawDocument("")).toEqual({
      elements: [],
      appState: {},
      files: {},
    });
  });

  it("reads a standard Excalidraw document", () => {
    expect(
      parseExcalidrawDocument(
        JSON.stringify({
          type: "excalidraw",
          elements: [{ id: "a" }],
          appState: { viewBackgroundColor: "#fff" },
          files: { image: { id: "image" } },
        }),
      ),
    ).toEqual({
      elements: [{ id: "a" }],
      appState: { viewBackgroundColor: "#fff" },
      files: { image: { id: "image" } },
    });
  });

  it("rejects invalid JSON and missing elements", () => {
    expect(() => parseExcalidrawDocument("{")).toThrow(/valid Excalidraw/);
    expect(() => parseExcalidrawDocument("{}")).toThrow(/elements array/);
  });
});

describe("serializeExcalidrawDocument", () => {
  it("writes the standard shape and removes transient app state", () => {
    const output = JSON.parse(
      serializeExcalidrawDocument(
        [{ id: "a" }],
        {
          viewBackgroundColor: "#fff",
          selectedElementIds: { a: true },
          collaborators: new Map([["x", {}]]),
        },
        { image: { id: "image" } },
      ),
    );
    expect(output).toMatchObject({
      type: "excalidraw",
      version: 2,
      source: "mdflow",
      elements: [{ id: "a" }],
      appState: { viewBackgroundColor: "#fff" },
      files: { image: { id: "image" } },
    });
    expect(output.appState.selectedElementIds).toBeUndefined();
    expect(output.appState.collaborators).toBeUndefined();
  });

  it("ignores viewport state so pan/zoom do not dirty the document", () => {
    const before = serializeExcalidrawDocument(
      [{ id: "a" }],
      { viewBackgroundColor: "#fff", scrollX: 0, scrollY: 0, zoom: { value: 1 } },
      {},
    );
    const after = serializeExcalidrawDocument(
      [{ id: "a" }],
      {
        viewBackgroundColor: "#fff",
        scrollX: 320,
        scrollY: -120,
        zoom: { value: 2.5 },
        width: 1000,
        height: 800,
        offsetTop: 40,
        offsetLeft: 60,
      },
      {},
    );
    expect(after).toBe(before);
    expect(JSON.parse(after).appState.scrollX).toBeUndefined();
    expect(JSON.parse(after).appState.zoom).toBeUndefined();
  });
});
