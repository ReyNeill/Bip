import type { TSCoreModule } from "./types.ts";

export function defineModule(module: Omit<TSCoreModule, "kind">): TSCoreModule {
  return {
    kind: "TSCoreModule",
    ...module,
  };
}
