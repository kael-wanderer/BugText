export type MindmapNode = {
  id: string;
  topic: string;
  children?: MindmapNode[];
  [key: string]: unknown;
};

export type Mindmap = {
  meta: Record<string, unknown>;
  format: "node_tree";
  data: MindmapNode;
};

const DEFAULT_ROOT_TOPIC = "Central Idea";

function defaultMindmap(): Mindmap {
  return {
    meta: { name: "mdflow", version: "1.0" },
    format: "node_tree",
    data: {
      id: "root",
      topic: DEFAULT_ROOT_TOPIC,
      "mm-shape": "none",
      children: [],
    },
  };
}

function plainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseMindmap(raw: string): Mindmap {
  if (!raw.trim()) return defaultMindmap();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("This file does not contain a valid mindmap.");
  }

  const obj = plainObject(parsed);
  const root = obj && plainObject(obj.data);
  if (!obj || !root || typeof root.id !== "string") {
    throw new Error("This file does not contain a valid mindmap.");
  }

  return {
    meta: plainObject(obj.meta) ?? {},
    format: "node_tree",
    data: root as MindmapNode,
  };
}

export function serializeMindmap(mind: unknown): string {
  const obj = plainObject(mind);
  const root = obj && plainObject(obj.data);
  return JSON.stringify(
    {
      meta: (obj && plainObject(obj.meta)) ?? { name: "mdflow", version: "1.0" },
      format: "node_tree",
      data: root ?? {
        id: "root",
        topic: DEFAULT_ROOT_TOPIC,
        "mm-shape": "none",
        children: [],
      },
    },
    null,
    2,
  );
}
