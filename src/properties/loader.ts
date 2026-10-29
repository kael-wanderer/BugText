// The YAML parser and the property editor load on first use, so `yaml` stays out of the
// startup bundle. Callers that need properties synchronously await `loadProperties()` first.
import type * as Parse from "./parse";
import type * as Edit from "./edit";

export type PropertiesModule = typeof Parse & typeof Edit;

let loaded: PropertiesModule | null = null;
let loading: Promise<PropertiesModule> | null = null;

export function loadProperties(): Promise<PropertiesModule> {
  loading ??= Promise.all([import("./parse"), import("./edit")])
    .then(([parse, edit]) => {
      loaded = { ...parse, ...edit };
      return loaded;
    })
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}

export function propertiesModule(): PropertiesModule | null {
  return loaded;
}
