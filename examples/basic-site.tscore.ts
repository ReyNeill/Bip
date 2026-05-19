import { defineModule } from "../src/tscore/define.ts";

const StringType = { kind: "primitive", name: "String" } as const;

export default defineModule({
  name: "BasicSiteCore",
  records: [
    {
      kind: "record",
      name: "PageRoute",
      fields: [
        { name: "path", type: StringType },
        { name: "label", type: StringType },
      ],
    },
  ],
  unions: [],
  constants: [
    {
      kind: "constant",
      name: "siteRoutes",
      type: { kind: "array", item: { kind: "named", name: "PageRoute" } },
      value: {
        kind: "array",
        items: [
          {
            kind: "record",
            typeName: "PageRoute",
            fields: {
              path: { kind: "string", value: "/" },
              label: { kind: "string", value: "Home" },
            },
          },
        ],
      },
      contracts: [
        { kind: "nonEmptyArray" },
        { kind: "allItemsFieldUnique", field: "path" },
        { kind: "allItemsFieldStartsWith", field: "path", prefix: "/" },
      ],
    },
  ],
  functions: [
    {
      kind: "function",
      name: "routePath",
      parameters: [{ name: "route", type: { kind: "named", name: "PageRoute" } }],
      returns: StringType,
      body: { kind: "field", target: { kind: "var", name: "route" }, field: "path" },
      contracts: [{ kind: "returnsField", parameter: "route", field: "path" }],
    },
  ],
  stateMachines: [
    {
      kind: "stateMachine",
      name: "publishTransition",
      stateName: "PublishState",
      actionName: "PublishAction",
      states: ["draft", "published", "archived"],
      actions: ["publish", "archive", "edit"],
      terminalStates: ["archived"],
      transitions: [
        { from: "draft", action: "publish", to: "published" },
        { from: "published", action: "archive", to: "archived" },
      ],
    },
  ],
});
