import { defineModule } from "bip";

const StringType = { kind: "primitive", name: "String" } as const;

export default defineModule({
  name: "ScanScoring",
  records: [
    {
      kind: "record",
      name: "ScanCategory",
      fields: [{ name: "name", type: StringType }],
    },
  ],
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
    {
      kind: "constant",
      name: "builtInScanCategories",
      type: { kind: "array", item: { kind: "named", name: "ScanCategory" } },
      value: {
        kind: "array",
        items: [
          {
            kind: "record",
            typeName: "ScanCategory",
            fields: { name: { kind: "string", value: "Project Checks" } },
          },
          {
            kind: "record",
            typeName: "ScanCategory",
            fields: { name: { kind: "string", value: "Discovered Boundaries" } },
          },
        ],
      },
      contracts: [
        { kind: "nonEmptyArray" },
        { kind: "allItemsFieldNonEmpty", field: "name" },
        { kind: "allItemsFieldUnique", field: "name" },
      ],
    },
  ],
  functions: [
    {
      kind: "function",
      name: "scanCategoryName",
      parameters: [{ name: "category", type: { kind: "named", name: "ScanCategory" } }],
      returns: StringType,
      body: { kind: "field", target: { kind: "var", name: "category" }, field: "name" },
      contracts: [{ kind: "returnsField", parameter: "category", field: "name" }],
    },
    {
      kind: "function",
      name: "leanCheckChecked",
      parameters: [{ name: "detail", type: StringType }],
      returns: { kind: "named", name: "LeanCheckResult" },
      body: {
        kind: "variant",
        unionName: "LeanCheckResult",
        tag: "status",
        variant: "checked",
        fields: { detail: { kind: "var", name: "detail" } },
      },
      contracts: [{ kind: "returnsVariant", variant: "checked" }],
    },
    {
      kind: "function",
      name: "leanCheckSkipped",
      parameters: [{ name: "detail", type: StringType }],
      returns: { kind: "named", name: "LeanCheckResult" },
      body: {
        kind: "variant",
        unionName: "LeanCheckResult",
        tag: "status",
        variant: "skipped",
        fields: { detail: { kind: "var", name: "detail" } },
      },
      contracts: [{ kind: "returnsVariant", variant: "skipped" }],
    },
    {
      kind: "function",
      name: "leanCheckFailed",
      parameters: [{ name: "detail", type: StringType }],
      returns: { kind: "named", name: "LeanCheckResult" },
      body: {
        kind: "variant",
        unionName: "LeanCheckResult",
        tag: "status",
        variant: "failed",
        fields: { detail: { kind: "var", name: "detail" } },
      },
      contracts: [{ kind: "returnsVariant", variant: "failed" }],
    },
    {
      kind: "function",
      name: "isLeanCheckChecked",
      parameters: [{ name: "result", type: { kind: "named", name: "LeanCheckResult" } }],
      returns: { kind: "primitive", name: "Bool" },
      body: {
        kind: "isVariant",
        target: { kind: "var", name: "result" },
        unionName: "LeanCheckResult",
        tag: "status",
        variant: "checked",
      },
      contracts: [{ kind: "variantPredicate", parameter: "result", variant: "checked" }],
    },
  ],
  stateMachines: [
    {
      kind: "stateMachine",
      name: "scanGateStatusTransition",
      stateName: "ScanGateStatus",
      actionName: "ScanFindingSignal",
      states: ["clean", "warn", "error"],
      actions: ["observeInfo", "observeWarn", "observeError"],
      terminalStates: ["error"],
      transitions: [
        { from: "clean", action: "observeWarn", to: "warn" },
        { from: "clean", action: "observeError", to: "error" },
        { from: "warn", action: "observeError", to: "error" },
      ],
    },
  ],
});
