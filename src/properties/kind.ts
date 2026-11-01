// Yaml-free property helpers, safe to import from startup code.
export type PropertyKind = "text" | "list" | "date" | "number" | "checkbox";

export function propertyKind(value: unknown): PropertyKind {
  if (Array.isArray(value)) return "list";
  if (typeof value === "boolean") return "checkbox";
  if (typeof value === "number") return "number";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return "date";
  return "text";
}

export function validKey(key: string): boolean {
  return key.trim() === key && !!key && !/[\r\n]/.test(key) && !key.startsWith(":");
}
