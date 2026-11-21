import { defineModule, record, recordList, stateMachine } from "../src/index.ts";

const StringType = { kind: "primitive", name: "String" } as const;
const ScanCategory = record("ScanCategory", { name: "String" });

export default defineModule({
  name: "ScanScoring",
  records: [ScanCategory],
  unions: [
    {
      kind: "taggedUnion",
      name: "LeanCheckResult",
      tag: "status",
      variants: [
        { name: "checked", fields: [{ name: "detail", type: StringType }] },
        { name: "skipped", fields: [{ name: "detail", type: StringType }] },
        { name: "failed", fields: [{ name: "detail", type: StringType }] },
      ],
    },
  ],
  constants: [
    recordList("builtInScanCategories", ScanCategory, [{ name: "Project Checks" }, { name: "Discovered Boundaries" }], {
      nonEmpty: true,
      nonEmptyFields: ["name"],
      unique: ["name"],
    }),
  ],
  functions: [],
  stateMachines: [
    stateMachine({
      name: "scanGateStatusTransition",
      stateName: "ScanGateStatus",
      actionName: "ScanFindingSignal",
      states: ["clean", "warn", "error"],
      actions: ["observeInfo", "observeWarn", "observeError"],
      initialState: "clean",
      terminalStates: ["error"],
      never: [{ from: "warn", to: "clean" }],
      transitions: [
        { from: "clean", action: "observeWarn", to: "warn" },
        { from: "clean", action: "observeError", to: "error" },
        { from: "warn", action: "observeError", to: "error" },
      ],
    }),
  ],
});
